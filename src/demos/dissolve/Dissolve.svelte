<script>
    import { onMount } from "svelte";
    import * as THREE from "three";
    import { OrbitControls } from "three/addons/controls/OrbitControls.js";
    import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
    import { MeshSurfaceSampler } from "three/addons/math/MeshSurfaceSampler.js";
    import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
    import GUI from "three/addons/libs/lil-gui.module.min.js";

    import guardVs from "./glsl/guard.vs.glsl?raw";
    import guardFs from "./glsl/guard.fs.glsl?raw";
    import particleVs from "./glsl/particle.vs.glsl?raw";
    import particleFs from "./glsl/particle.fs.glsl?raw";
    import blurVs from "./glsl/blur.vs.glsl?raw";
    import blurFs from "./glsl/blur.fs.glsl?raw";
    import addBlurFs from "./glsl/addBlur.fs.glsl?raw";

    const ASSETS = "/demos/dissolve";

    let canvasEl;
    let guiEl;

    onMount(() => {
        // Sized to the canvas box rather than the window, since the demo sits inside the page layout
        const size = () => ({ width: canvasEl.clientWidth, height: canvasEl.clientHeight });
        let { width, height } = size();

        const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true });
        // Important: if LinearSRGBColorSpace, darker; if SRGBColorSpace, brighter.
        // Settings of render targets better match this.
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.setSize(width, height, false);

        const scene = new THREE.Scene();         // Basic scene
        const sceneGlowOnly = new THREE.Scene(); // Scene for post processing: outer glow

        const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
        camera.position.set(0, 2, 2);

        scene.add(new THREE.GridHelper(2, 20));
        scene.add(new THREE.AxesHelper(0.1));

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true; // Smooth movement
        controls.dampingFactor = 0.05;
        controls.screenSpacePanning = false;
        controls.minDistance = 1;
        controls.maxDistance = 20;

        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(0, 3, 5);
        light.color.setRGB(1.0, 1.0, 0.96);
        light.intensity = 3.5;
        scene.add(light);

        const envMap = new THREE.CubeTextureLoader().setPath(`${ASSETS}/cubemap/`).load([
            "posx.jpg", "negx.jpg", // +X, -X
            "posy.jpg", "negy.jpg", // +Y, -Y
            "posz.jpg", "negz.jpg", // +Z, -Z
        ]);
        envMap.colorSpace = THREE.SRGBColorSpace;
        scene.environment = envMap;
        scene.background = envMap; // Make the cubemap visible by setting it as bg
        scene.backgroundIntensity = 2.5;

        const params = {
            disvProgress: 0.1,
            disvEdgeWidth: 0.02,
            disvEdgeColor: "#520000",
            particleColor: "#ffb400",
        };

        // ── Guard material ──────────────────────────────────────────────────
        const guardMaterial = new THREE.ShaderMaterial({
            vertexShader: guardVs,
            fragmentShader: guardFs,
            uniforms: {
                metalness: { value: 1.0 },
                roughness: { value: 0.1 },
                lightPosition: { value: light.position },
                lightColor: { value: light.color },
                lightIntensity: { value: light.intensity },
                envMap: { value: envMap },
                disvProgress: { value: params.disvProgress },
                disvEdgeWidth: { value: params.disvEdgeWidth },
                disvEdgeColor: { value: new THREE.Color(params.disvEdgeColor) },
            },
        });

        // ── Particle material ───────────────────────────────────────────────
        const particleSize = 0.005;
        const particleGeometry = new THREE.CircleGeometry(particleSize, 8);
        const particleMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0.0 },
                disvProgress: { value: params.disvProgress },
                disvEdgeWidth: { value: params.disvEdgeWidth },
                particleColor: { value: new THREE.Color(params.particleColor) },
                risingSpeed: { value: 0.1 },
                turbulenceAmplitude: { value: 0.02 },
                fadeStartHeight: { value: 1.8 },
                fadeEndHeight: { value: 2.2 },
                loopDuration: { value: 5.0 }, // Loop length in seconds
            },
            vertexShader: particleVs,
            fragmentShader: particleFs,
            depthWrite: false,
            transparent: true,
        });
        const particleLifeRange = 10.0;

        // ── Controls panel ──────────────────────────────────────────────────
        const gui = new GUI({ container: guiEl });
        gui.add(params, "disvProgress", 0.0, 1.0, 0.01).onChange((v) => {
            guardMaterial.uniforms.disvProgress.value = v;
            particleMaterial.uniforms.disvProgress.value = v;
        });
        gui.add(params, "disvEdgeWidth", 0.0, 0.2, 0.002).onChange((v) => {
            guardMaterial.uniforms.disvEdgeWidth.value = v;
            particleMaterial.uniforms.disvEdgeWidth.value = v;
        });
        gui.addColor(params, "disvEdgeColor").onChange((v) => guardMaterial.uniforms.disvEdgeColor.value.set(v));
        gui.addColor(params, "particleColor").onChange((v) => particleMaterial.uniforms.particleColor.value.set(v));
        // The panel is 245px wide, so start it collapsed where it would hide most of the canvas
        if (width < 480) gui.close();

        // ── FBX model and surface particles ─────────────────────────────────
        let disposed = false;
        let model = null;
        let particles = null;
        new FBXLoader().load(
            `${ASSETS}/guard.fbx`,
            (fbx) => {
                if (disposed) return;
                model = fbx;
                // The file's root node is scaled 100x; reset it to the scene's units
                fbx.scale.set(1.0, 1.0, 1.0);
                fbx.position.set(0.0, 0.0, 0.0);

                let meshForSampling = null;
                fbx.traverse((child) => {
                    if (!child.isMesh) return;
                    child.material = guardMaterial;
                    meshForSampling ??= child;
                });
                scene.add(fbx);
                if (!meshForSampling) return;

                // Has to merge vertices, or else it will lose smooth shading
                meshForSampling.geometry = mergeVertices(meshForSampling.geometry);
                meshForSampling.geometry.computeBoundingBox();
                meshForSampling.geometry.computeVertexNormals();

                const sampler = new MeshSurfaceSampler(meshForSampling).build();
                const particleCount = 40000;
                particles = new THREE.InstancedMesh(particleGeometry, particleMaterial, particleCount);
                const instanceBirth = new Float32Array(particleCount);

                const dummy = new THREE.Object3D();
                const tempPosition = new THREE.Vector3();
                for (let i = 0; i < particleCount; i++) {
                    sampler.sample(tempPosition);
                    // Somehow we always have to flip signs of y and z
                    tempPosition.y *= -1.0;
                    tempPosition.z *= -1.0;
                    tempPosition.y += 0.2; // Adjust for the sampler's inaccuracy
                    tempPosition.x += (-1.0 + Math.random() * 2.0) * 0.1; // Some randomness in the birth x pos

                    dummy.position.copy(tempPosition);
                    dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
                    dummy.scale.setScalar(0.4 + Math.random() * 0.9); // Starting scale
                    dummy.updateMatrix();
                    particles.setMatrixAt(i, dummy.matrix);

                    instanceBirth[i] = Math.random() * particleLifeRange; // Random birth time (delay)
                }
                particles.geometry.setAttribute("instanceBirth", new THREE.InstancedBufferAttribute(instanceBirth, 1));
                sceneGlowOnly.add(particles);
            },
            undefined,
            (error) => console.error("Error loading FBX:", error)
        );

        // ── Post processing ─────────────────────────────────────────────────
        const rtOptions = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.HalfFloatType,
            colorSpace: THREE.SRGBColorSpace,
        };
        // The glow target is half size, which downsamples it so the glow is smoother
        const renderTargetGlow = new THREE.WebGLRenderTarget(width / 2, height / 2, rtOptions);
        const renderTargetBlur = new THREE.WebGLRenderTarget(width, height, rtOptions);
        const renderTargetBase = new THREE.WebGLRenderTarget(width, height, rtOptions);

        const postScene = new THREE.Scene();
        const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const screenGeometry = new THREE.PlaneGeometry(2, 2);
        const screenQuad = new THREE.Mesh(screenGeometry, null); // Material is swapped per pass
        postScene.add(screenQuad);

        const blurMaterialH = new THREE.ShaderMaterial({
            vertexShader: blurVs,
            fragmentShader: blurFs,
            uniforms: {
                tDiffuse: { value: null },
                uDirection: { value: new THREE.Vector2(1.0, 0.0) },
                uBlurAmount: { value: 2.5 },
                uResolution: { value: new THREE.Vector2(width, height) },
            },
        });
        const blurMaterialV = blurMaterialH.clone();
        blurMaterialV.uniforms.uDirection.value = new THREE.Vector2(0.0, 1.0);

        const addMaterial = new THREE.ShaderMaterial({
            vertexShader: blurVs,
            fragmentShader: addBlurFs,
            uniforms: {
                tBase: { value: null },
                tGlow: { value: null },
            },
        });

        let animId;
        function animate() {
            animId = requestAnimationFrame(animate);
            controls.update();
            particleMaterial.uniforms.time.value = performance.now() / 1000;

            // Step 1: render glow (particles only) to the first target
            renderer.setRenderTarget(renderTargetGlow);
            renderer.clear();
            renderer.render(sceneGlowOnly, camera);

            // Step 2: horizontal blur (ping)
            screenQuad.material = blurMaterialH;
            blurMaterialH.uniforms.tDiffuse.value = renderTargetGlow.texture;
            renderer.setRenderTarget(renderTargetBlur);
            renderer.render(postScene, postCamera);

            // Step 3: vertical blur (pong)
            screenQuad.material = blurMaterialV;
            blurMaterialV.uniforms.tDiffuse.value = renderTargetBlur.texture;
            renderer.setRenderTarget(renderTargetGlow);
            renderer.render(postScene, postCamera);

            // Step 4: render the main scene, then the sharp particles on top of it.
            // sceneGlowOnly has a null background, so autoClear off keeps the base content.
            renderer.setRenderTarget(renderTargetBase);
            renderer.clear();
            renderer.render(scene, camera);
            const oldAutoClear = renderer.autoClear;
            renderer.autoClear = false;
            renderer.render(sceneGlowOnly, camera);
            renderer.autoClear = oldAutoClear;

            // Step 5: composite the base scene and the blurred glow to the canvas
            renderer.setRenderTarget(null);
            renderer.clear();
            screenQuad.material = addMaterial;
            addMaterial.uniforms.tBase.value = renderTargetBase.texture;
            addMaterial.uniforms.tGlow.value = renderTargetGlow.texture;
            renderer.render(postScene, postCamera);
        }
        animate();

        const ro = new ResizeObserver(() => {
            ({ width, height } = size());
            if (width === 0 || height === 0) return;
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            renderer.setSize(width, height, false);
            renderTargetGlow.setSize(width / 2, height / 2);
            renderTargetBlur.setSize(width, height);
            renderTargetBase.setSize(width, height);
            blurMaterialH.uniforms.uResolution.value.set(width, height);
            blurMaterialV.uniforms.uResolution.value.set(width, height);
        });
        ro.observe(canvasEl);

        return () => {
            disposed = true;
            cancelAnimationFrame(animId);
            ro.disconnect();
            gui.destroy();
            controls.dispose();
            model?.traverse((child) => child.isMesh && child.geometry.dispose());
            particles?.dispose();
            [particleGeometry, screenGeometry].forEach((g) => g.dispose());
            [guardMaterial, particleMaterial, blurMaterialH, blurMaterialV, addMaterial].forEach((m) => m.dispose());
            [renderTargetGlow, renderTargetBlur, renderTargetBase].forEach((rt) => rt.dispose());
            envMap.dispose();
            renderer.dispose();
        };
    });
</script>

<div class="dissolve">
    <canvas bind:this={canvasEl}></canvas>
    <div class="gui" bind:this={guiEl}></div>
</div>

<style>
    .dissolve {
        position: relative;
        width: 100%;
    }

    canvas {
        display: block;
        width: 100%;
        aspect-ratio: 4 / 3;
    }

    .gui {
        position: absolute;
        top: 0;
        right: 0;
    }
</style>
