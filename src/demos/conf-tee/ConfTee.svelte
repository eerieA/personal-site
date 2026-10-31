<script>
    import { onDestroy } from "svelte";
    import { examples, SAMPLE_INFRA_PREFIXES } from "./examples";
    import defaultSchema from "./cisco-campus.yaml?raw";

    // "" means the inputs no longer match any example (edited or opened from a file)
    let exampleKey = $state(examples[0].key);
    let golden = $state(examples[0].golden);
    let user = $state(examples[0].user);
    let schema = $state(defaultSchema);

    let busy = $state(false);
    let status = $state("");
    let error = $state("");
    let result = $state(null);
    let showJson = $state(false);

    const example = $derived(examples.find((e) => e.key === exampleKey));
    const findingCount = $derived(result ? result.summary.reduce((n, [count]) => n + count, 0) : 0);

    function pickExample(key) {
        exampleKey = key;
        const e = examples.find((x) => x.key === key);
        if (!e) return;
        golden = e.golden;
        user = e.user;
        schema = defaultSchema;
        result = null;
        error = "";
    }

    function edited() {
        exampleKey = "";
    }

    async function openFile(event, assign) {
        const file = event.currentTarget.files?.[0];
        if (!file) return;
        // Read locally; nothing is uploaded
        assign(await file.text());
        edited();
        event.currentTarget.value = "";
    }

    // The worker (and the ~14 MB Python download behind it) starts on the first check, not on page load
    let worker = null;
    let started = $state(false);
    function getWorker() {
        if (worker) return worker;
        started = true;
        worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
        worker.onmessage = ({ data }) => {
            if (data.type === "status") {
                status = data.message;
                return;
            }
            busy = false;
            status = "";
            if (data.type === "error") error = data.message;
            else result = { summary: data.summary, report: data.report };
        };
        return worker;
    }
    onDestroy(() => worker?.terminate());

    function runCheck() {
        error = "";
        result = null;
        const empty = [["template", golden], ["config", user], ["schema", schema]].find(([, text]) => !text.trim());
        if (empty) {
            error = `The ${empty[0]} is empty.`;
            return;
        }
        busy = true;
        status = "Starting…";
        getWorker().postMessage({
            golden: $state.snapshot(golden),
            user: $state.snapshot(user),
            schema: $state.snapshot(schema),
            infraPrefixes: example ? SAMPLE_INFRA_PREFIXES : null,
        });
    }

    // Device and section entries are either flags ("missing-device", ["extra-section"]) or line findings
    const deviceFlag = (sections) => Object.keys(sections).find((k) => k.endsWith("-device"));
    const sectionFlag = (entries) => (typeof entries[0] === "string" ? entries[0] : null);
</script>

<div class="conftee">
    <div class="toolbar">
        <label>
            Example
            <select value={exampleKey} onchange={(e) => pickExample(e.currentTarget.value)}>
                {#each examples as e}
                    <option value={e.key}>{e.label}</option>
                {/each}
                {#if !example}
                    <option value="">Your own input</option>
                {/if}
            </select>
        </label>
        {#if example}
            <p class="hint">{example.description}</p>
        {/if}
    </div>

    <div class="inputs">
        {@render editor("Template", "Config with {Variable} holes", golden, (v) => (golden = v))}
        {@render editor("Config to check", "The real config", user, (v) => (user = v))}
    </div>

    <details class="schema">
        <summary>Schema (default: <code>cisco-campus.yaml</code>, bundled with conf-tee)</summary>
        {@render editor("Schema", "YAML vocabulary for the template's variables", schema, (v) => (schema = v))}
    </details>

    <div class="run">
        <button type="button" onclick={runCheck} disabled={busy}>Check</button>
        {#if busy}
            <span class="status" role="status">{status}</span>
        {:else if !started}
            <span class="hint">The first check downloads about 14 MB (Python and pandas), then the browser caches it.</span>
        {/if}
    </div>

    {#if error}
        <p class="error" role="alert">{error}</p>
    {/if}

    {#if result}
        <section class="result" aria-live="polite">
            <ul class="summary">
                {#each result.summary as [count, label]}
                    <li class:zero={count === 0}><strong>{count}</strong> {label}</li>
                {/each}
            </ul>

            {#if findingCount === 0 && Object.keys(result.report).length === 0}
                <p>The config conforms to the template.</p>
            {/if}

            {#each Object.entries(result.report) as [device, sections]}
                <div class="device">
                    <h3>{device}</h3>
                    {#if deviceFlag(sections)}
                        <span class="tag">{deviceFlag(sections)}</span>
                    {:else}
                        {#each Object.entries(sections) as [section, entries]}
                            <div class="section">
                                <h4>{section}</h4>
                                {#if sectionFlag(entries)}
                                    <span class="tag">{sectionFlag(entries)}</span>
                                {:else}
                                    <ul class="findings">
                                        {#each entries as [kinds, f]}
                                            <li>
                                                <div class="finding-head">
                                                    <span class="line">Line {f.line}</span>
                                                    {#each kinds.split(", ") as kind}
                                                        <span class="tag">{kind}</span>
                                                    {/each}
                                                </div>
                                                <pre><span class="label">expected</span> {f.expected}
<span class="label">actual  </span> {f.actual}</pre>
                                                {#if f.explanations?.length}
                                                    <ul class="explanations">
                                                        {#each f.explanations as text}
                                                            <li>{text}</li>
                                                        {/each}
                                                    </ul>
                                                {/if}
                                            </li>
                                        {/each}
                                    </ul>
                                {/if}
                            </div>
                        {/each}
                    {/if}
                </div>
            {/each}

            <button type="button" class="link" onclick={() => (showJson = !showJson)}>
                {showJson ? "Hide" : "Show"} JSON report
            </button>
            {#if showJson}
                <pre class="json">{JSON.stringify(result.report, null, 2)}</pre>
            {/if}
        </section>
    {/if}
</div>

{#snippet editor(title, placeholder, value, assign)}
    <div class="editor">
        <div class="editor-head">
            <span>{title}</span>
            <label class="open">
                Open file
                <input type="file" accept=".txt,.cfg,.conf,.yaml,.yml,text/*" onchange={(e) => openFile(e, assign)} />
            </label>
        </div>
        <textarea
            {placeholder}
            spellcheck="false"
            aria-label={title}
            {value}
            oninput={(e) => {
                assign(e.currentTarget.value);
                edited();
            }}
        ></textarea>
    </div>
{/snippet}

<style>
    .conftee {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        font-size: 0.875rem;
        color: var(--color-primary);
    }

    .toolbar {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
    }

    .toolbar label {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    select,
    textarea,
    button {
        font: inherit;
        color: var(--color-primary);
        background: var(--color-white);
        border: 1px solid var(--color-neutral-200);
        border-radius: 3px;
    }

    select {
        padding: 0.2rem 0.35rem;
        max-width: 100%;
    }

    .hint {
        margin: 0;
        font-size: 0.75rem;
        color: var(--color-neutral-600);
    }

    .inputs {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 1rem;
    }

    @media (min-width: 1024px) {
        .inputs {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }
    }

    .editor {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }

    .editor-head {
        display: flex;
        justify-content: space-between;
        font-weight: 600;
    }

    .open {
        position: relative;
        font-weight: normal;
        font-size: 0.75rem;
        text-decoration: underline;
        cursor: pointer;
    }

    .open:hover {
        color: var(--color-cyan-500);
    }

    .open input {
        position: absolute;
        width: 1px;
        height: 1px;
        opacity: 0;
    }

    .open:focus-within {
        outline: 2px solid var(--color-cyan-500);
    }

    textarea {
        min-height: 14rem;
        padding: 0.4rem;
        font-family: ui-monospace, Consolas, monospace;
        font-size: 0.75rem;
        line-height: 1.4;
        white-space: pre;
        overflow: auto;
        resize: vertical;
    }

    .schema summary {
        cursor: pointer;
        margin-bottom: 0.5rem;
    }

    .run {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        flex-wrap: wrap;
    }

    .run button {
        padding: 0.3rem 1.2rem;
        font-weight: 600;
        cursor: pointer;
    }

    .run button:hover:not(:disabled) {
        border-color: var(--color-cyan-500);
    }

    .run button:disabled {
        opacity: 0.6;
        cursor: progress;
    }

    .status {
        font-style: italic;
    }

    .error {
        margin: 0;
        padding: 0.5rem;
        border-left: 3px solid #c0392b;
        background: var(--color-neutral-100);
        white-space: pre-wrap;
    }

    .result {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }

    .summary {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        list-style: none;
        margin: 0;
        padding: 0;
    }

    .summary li {
        padding: 0.2rem 0.5rem;
        border-radius: 3px;
        background: var(--color-neutral-200);
    }

    .summary li.zero {
        background: transparent;
        border: 1px solid var(--color-neutral-200);
        color: var(--color-neutral-600);
    }

    .device h3 {
        font-weight: 700;
        margin: 0 0 0.25rem;
    }

    .section {
        margin: 0 0 0.5rem 0.75rem;
    }

    .section h4 {
        font-weight: 600;
        margin: 0 0 0.25rem;
    }

    .findings {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .findings > li {
        padding-left: 0.6rem;
        border-left: 2px solid var(--color-neutral-200);
    }

    .finding-head {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.3rem;
    }

    .line {
        font-weight: 600;
    }

    .tag {
        display: inline-block;
        font-size: 0.7rem;
        padding: 0.05rem 0.35rem;
        border-radius: 3px;
        background: var(--color-neutral-200);
    }

    pre {
        margin: 0.25rem 0;
        font-family: ui-monospace, Consolas, monospace;
        font-size: 0.75rem;
        white-space: pre-wrap;
        word-break: break-all;
    }

    .label {
        color: var(--color-neutral-600);
    }

    .explanations {
        margin: 0;
        padding-left: 1.1rem;
        list-style: disc;
        color: var(--color-neutral-600);
    }

    .link {
        align-self: flex-start;
        border: none;
        background: none;
        padding: 0;
        text-decoration: underline;
        cursor: pointer;
    }

    .link:hover {
        color: var(--color-cyan-500);
    }

    .json {
        padding: 0.5rem;
        max-height: 24rem;
        overflow: auto;
        background: var(--color-neutral-100);
        white-space: pre;
        word-break: normal;
    }
</style>
