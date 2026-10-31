<script>
    import { onMount } from "svelte";
    import * as THREE from "three";
    import { vertexShader, fragmentShader } from "./HalftoneShader.js";

    const { src, width, height } = $props();

    // Hover and reveal tuning, same values the old home gallery cards used
    const HOVER_LERP = 0.1;
    const REVEAL_SPEED = 0.025; // reveal radius growth per frame, ~0.67s to full at 60fps
    const REVEAL_MAX = 1.0;     // UV radius from the center; 1.0 covers the whole image

    let canvasEl;
    let hovered = false;

    onMount(() => {
        const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        // The canvas has the image's aspect ratio, so a unit plane under a unit
        // orthographic camera fills it without distortion
        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.1, 10);
        camera.position.z = 1;

        const texture = new THREE.TextureLoader().load(src);
        texture.colorSpace = THREE.SRGBColorSpace;

        const geo = new THREE.PlaneGeometry(1, 1);
        const baseMat = new THREE.MeshBasicMaterial({ map: texture });
        scene.add(new THREE.Mesh(geo, baseMat));

        // The halftone overlay sits just in front of the image and blends over it
        const overlayMat = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            transparent: true,
            uniforms: {
                uTexture: { value: texture },
                uTime: { value: 0 },
                uHover: { value: 0 },
                uRevealRadius: { value: 0 },
                uAlpha: { value: 0.5 },
            },
        });
        const overlay = new THREE.Mesh(geo, overlayMat);
        overlay.position.z = 0.001;
        scene.add(overlay);

        const u = overlayMat.uniforms;
        let animId;
        function animate() {
            animId = requestAnimationFrame(animate);
            // The noise only drifts while idle, so the hovered image holds still
            if (!hovered) u.uTime.value += 0.016;
            u.uHover.value += ((hovered ? 1 : 0) - u.uHover.value) * HOVER_LERP;
            u.uRevealRadius.value = hovered ? Math.min(u.uRevealRadius.value + REVEAL_SPEED, REVEAL_MAX) : 0;
            renderer.render(scene, camera);
        }

        const ro = new ResizeObserver(([entry]) => {
            const { width, height } = entry.contentRect;
            if (width > 0 && height > 0) renderer.setSize(width, height, false);
        });
        ro.observe(canvasEl);
        animate();

        return () => {
            cancelAnimationFrame(animId);
            ro.disconnect();
            geo.dispose();
            texture.dispose();
            baseMat.dispose();
            overlayMat.dispose();
            renderer.dispose();
        };
    });
</script>

<canvas
    bind:this={canvasEl}
    style="aspect-ratio: {width} / {height};"
    onpointerenter={() => (hovered = true)}
    onpointerleave={() => (hovered = false)}
></canvas>

<style>
    canvas {
        display: block;
        width: 100%;
        max-width: 480px;
    }
</style>
