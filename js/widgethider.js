import { app } from "../../scripts/app.js";

const HIDDEN_TAG = "tschide";

// --- Utility Functions ---

const findWidget = (node, name) => node.widgets?.find((w) => w.name === name);

const toggleWidget = (node, widget, show) => {
    if (!widget) return;

    // Store original properties
    if (!widget.origProps) {
        widget.origProps = {
            type: widget.type,
            computeSize: widget.computeSize,
            draw: widget.draw,
        };
    }

    const isVisible = widget.type !== HIDDEN_TAG;
    if (isVisible === show) return;

    if (show) {
        widget.type = widget.origProps.type;
        widget.computeSize = widget.origProps.computeSize;
        widget.draw = widget.origProps.draw;
    } else {
        widget.type = HIDDEN_TAG;
        widget.computeSize = () => [0, -4];
        widget.draw = () => { };
    }

    // Handle linked widgets recursively
    widget.linkedWidgets?.forEach((w) => toggleWidget(node, w, show));
};

const toggleWidgets = (node, names, show) => {
    names.forEach((name) => toggleWidget(node, findWidget(node, name), show));
};

const resizeNode = (node) => {
    app.graph?.setDirtyCanvas(true, true);
    if (node.is_configuring) return;

    const currentHeight = node.size[1];
    const newHeight = node.computeSize()[1];
    const lastHeight = node._lastComputedHeight;
    node._lastComputedHeight = newHeight;

    // If layout requirements haven't changed (computed size is same), don't touch size.
    if (lastHeight === newHeight && currentHeight === newHeight) return;

    node.setSize([node.size[0], newHeight]);
};

const updateGroupVisibility = (node, map, key) => {
    if (!map) return;
    const allWidgets = new Set(Object.values(map).flat());
    const visibleWidgets = new Set(map[key] || []);
    allWidgets.forEach((name) => {
        toggleWidget(node, findWidget(node, name), visibleWidgets.has(name));
    });
    resizeNode(node);
};

function ensureSeedControl(node, callback, attempts = 0) {
    if (node.seedControl && node.seedControl.lastSeedButton) {
        callback(node.seedControl.lastSeedButton);
    } else if (attempts < 20) {
        setTimeout(() => ensureSeedControl(node, callback, attempts + 1), 100);
    }
}

// --- Data Generators & Constants ---

const gen = (base, count) =>
    Array.from({ length: count }, (_, i) => `${base}_${i + 1}`);

const BATCH = ["batch_path", "subdirectories", "batch_sort", "batch_max"];
const X_BATCH = [
    "X_batch_path",
    "X_subdirectories",
    "X_batch_sort",
    "X_batch_max",
];
const CKPT = gen("ckpt_name", 50);
const CLIP = gen("clip_skip", 50);
const VAE = gen("vae_name", 50);
const LORA = gen("lora_name", 50);
const L_WT = gen("lora_wt", 50);
const M_STR = gen("model_str", 50);
const C_STR = gen("clip_str", 50);

const VISIBILITY_MAPS = {
    "XY Input: Steps": {
        steps: [
            "first_start_step",
            "last_start_step",
            "first_end_step",
            "last_end_step",
            "first_refine_step",
            "last_refine_step",
        ],
        start_at_step: [
            "first_step",
            "last_step",
            "first_end_step",
            "last_end_step",
            "first_refine_step",
            "last_refine_step",
        ],
        end_at_step: [
            "first_step",
            "last_step",
            "first_start_step",
            "last_start_step",
            "first_refine_step",
            "last_refine_step",
        ],
        refine_at_step: [
            "first_step",
            "last_step",
            "first_start_step",
            "last_start_step",
            "first_end_step",
            "last_end_step",
        ],
    },
    "XY Input: VAE": {
        "VAE Names": BATCH,
        "VAE Batch": [...VAE, "vae_count"],
    },
    "XY Input: Checkpoint": {
        "Ckpt Names": [...CLIP, ...VAE, ...BATCH],
        "Ckpt Names+ClipSkip": [...VAE, ...BATCH],
        "Ckpt Names+ClipSkip+VAE": BATCH,
        "Checkpoint Batch": [...CKPT, ...CLIP, ...VAE, "ckpt_count"],
    },
    "XY Input: LoRA": {
        "LoRA Names": [...M_STR, ...C_STR, ...BATCH],
        "LoRA Names+Weights": [...BATCH, "model_strength", "clip_strength"],
        "LoRA Batch": [...LORA, ...M_STR, ...C_STR, "lora_count"],
    },
    "XY Input: LoRA Plot": {
        "X: LoRA Batch, Y: LoRA Weight": [
            "lora_name",
            "model_strength",
            "clip_strength",
            "X_first_value",
            "X_last_value",
        ],
        "X: LoRA Batch, Y: Model Strength": [
            "lora_name",
            "model_strength",
            "X_first_value",
            "X_last_value",
        ],
        "X: LoRA Batch, Y: Clip Strength": [
            "lora_name",
            "clip_strength",
            "X_first_value",
            "X_last_value",
        ],
        "X: Model Strength, Y: Clip Strength": [
            ...X_BATCH,
            "model_strength",
            "clip_strength",
        ],
    },
    "XY Input: Control Net": {
        strength: [
            "first_start_percent",
            "last_start_percent",
            "first_end_percent",
            "last_end_percent",
            "strength",
        ],
        start_percent: [
            "first_strength",
            "last_strength",
            "first_end_percent",
            "last_end_percent",
            "start_percent",
        ],
        end_percent: [
            "first_strength",
            "last_strength",
            "first_start_percent",
            "last_start_percent",
            "end_percent",
        ],
    },
    "XY Input: Control Net Plot": {
        "X: Strength, Y: Start%": ["strength", "start_percent"],
        "X: Strength, Y: End%": ["strength", "end_percent"],
        "X: Start%, Y: Strength": ["start_percent", "strength"],
        "X: Start%, Y: End%": ["start_percent", "end_percent"],
        "X: End%, Y: Strength": ["end_percent", "strength"],
        "X: End%, Y: Start%": ["end_percent", "start_percent"],
    },
};

// --- Logic Helpers ---

function handleStacker(node, count, type, mode) {
    count = parseInt(count, 10) || 0;
    if (mode?.includes("Batch")) count = 0;

    const defs = {
        LoRA: ["lora_name", "model_str", "clip_str"],
        Checkpoint: ["ckpt_name", "clip_skip", "vae_name"],
        "LoRA Stacker": ["lora_name", "model_str", "clip_str", "lora_wt"],
    }[type];

    if (!defs) return;

    for (let i = 1; i <= 50; i++) {
        const active = i <= count;
        toggleWidget(node, findWidget(node, `${defs[0]}_${i}`), active);

        let s2 = active,
            s3 = active,
            s4 = active;

        if (type === "LoRA Stacker") {
            s2 = s3 = mode === "advanced" && active;
            s4 = mode === "simple" && active;
        } else if (type === "Checkpoint") {
            s2 = active && mode.includes("ClipSkip");
            s3 = active && mode.includes("VAE");
        } else if (type === "LoRA") {
            s2 = s3 = active && mode.includes("Weights");
        }

        toggleWidget(node, findWidget(node, `${defs[1]}_${i}`), s2);
        if (defs[2])
            toggleWidget(node, findWidget(node, `${defs[2]}_${i}`), s3);
        if (defs[3])
            toggleWidget(node, findWidget(node, `${defs[3]}_${i}`), s4);
    }
    resizeNode(node);
}

function handleSampler(node) {
    const target = findWidget(node, "target_parameter")?.value;
    const count = parseInt(findWidget(node, "input_count")?.value || 0, 10);
    const showAll = target === "sampler & scheduler";

    for (let i = 1; i <= 50; i++) {
        const active = i <= count;
        toggleWidget(
            node,
            findWidget(node, `sampler_${i}`),
            active && (showAll || target === "sampler"),
        );
        toggleWidget(
            node,
            findWidget(node, `scheduler_${i}`),
            active && (showAll || target === "scheduler"),
        );
    }
    resizeNode(node);
}

function handleGenericRange(node, prefix, count, cond = true) {
    const c = parseInt(count, 10) || 0;
    for (let i = 1; i <= 50; i++) {
        toggleWidget(node, findWidget(node, `${prefix}${i}`), cond && i <= c);
    }
    resizeNode(node);
}

function handleHiRes(node) {
    const type = findWidget(node, "upscale_type")?.value;
    const sameSeed = findWidget(node, "use_same_seed")?.value === true;
    const useCN = findWidget(node, "use_controlnet")?.value === true;
    const cnValid = findWidget(node, "use_controlnet")?.value !== "_";

    const isLatent = type !== "pixel";
    const isPixel = type !== "latent";

    // Core Widgets
    toggleWidget(node, findWidget(node, "pixel_upscaler"), isPixel);
    [
        "hires_ckpt_name",
        "latent_upscaler",
        "use_same_seed",
        "hires_steps",
        "denoise",
        "iterations",
    ].forEach((n) => toggleWidget(node, findWidget(node, n), isLatent));

    // Seed Control
    const seedShow = isLatent && !sameSeed;
    toggleWidget(node, findWidget(node, "seed"), seedShow);

    ensureSeedControl(node, (btn) => {
        // Re-evaluate conditions to avoid stale closures from async retries
        const currentType = findWidget(node, "upscale_type")?.value;
        const currentSameSeed = findWidget(node, "use_same_seed")?.value === true;
        const currentIsLatent = currentType !== "pixel";
        const currentSeedShow = currentIsLatent && !currentSameSeed;
        toggleWidget(node, btn, currentSeedShow);
        btn.disabled = !currentSeedShow;
        resizeNode(node);
    });

    // ControlNet
    const showCN = isLatent && cnValid;
    toggleWidget(node, findWidget(node, "use_controlnet"), isLatent);

    [
        "control_net_name",
        "strength",
        "preprocessor",
        "preprocessor_imgs",
    ].forEach((n) => toggleWidget(node, findWidget(node, n), showCN && useCN));

    resizeNode(node);
}

function xyCkptRefinerOptionsRemove(widget, node) {
    const target_ckpt = findWidget(node, "target_ckpt").value;
    const input_mode = widget.value;

    if (input_mode === "Ckpt Names+ClipSkip+VAE" && target_ckpt === "Refiner") {
        if (widget.last_ckpt_input_mode === "Ckpt Names+ClipSkip") {
            widget.value =
                widget.last_target_ckpt === "Refiner"
                    ? "Checkpoint Batch"
                    : "Ckpt Names+ClipSkip";
        } else if (widget.last_ckpt_input_mode === "Checkpoint Batch") {
            widget.value =
                widget.last_target_ckpt === "Refiner"
                    ? "Ckpt Names+ClipSkip"
                    : "Checkpoint Batch";
        } else if (widget.last_ckpt_input_mode !== undefined) {
            widget.value = widget.last_ckpt_input_mode;
        } else {
            widget.value = "Ckpt Names";
        }
    } else if (input_mode !== "Ckpt Names+ClipSkip+VAE") {
        widget.last_ckpt_input_mode = input_mode;
    }
    widget.last_target_ckpt = target_ckpt;
}

// --- Handlers Map ---

const HANDLERS = {
    "Efficient Loader": {
        lora_name: (n, w) => {
            toggleWidgets(
                n,
                ["lora_model_strength", "lora_clip_strength"],
                w.value !== "None",
            );
            resizeNode(n);
        },
    },
    "Eff. Loader SDXL": {
        refiner_ckpt_name: (n, w) => {
            toggleWidgets(
                n,
                ["refiner_clip_skip", "positive_ascore", "negative_ascore"],
                w.value !== "None",
            );
            resizeNode(n);
        },
    },
    "LoRA Stacker": {
        input_mode: (n, w) =>
            handleStacker(
                n,
                findWidget(n, "lora_count")?.value,
                "LoRA Stacker",
                w.value,
            ),
        lora_count: (n, w) =>
            handleStacker(
                n,
                w.value,
                "LoRA Stacker",
                findWidget(n, "input_mode")?.value,
            ),
    },
    "XY Input: Steps": {
        target_parameter: (n, w) =>
            updateGroupVisibility(n, VISIBILITY_MAPS[n.comfyClass], w.value),
    },
    "XY Input: Sampler/Scheduler": {
        target_parameter: (n) => handleSampler(n),
        input_count: (n) => handleSampler(n),
    },
    "XY Input: VAE": {
        input_mode: (n, w) => {
            updateGroupVisibility(n, VISIBILITY_MAPS[n.comfyClass], w.value);
            handleGenericRange(
                n,
                "vae_name_",
                findWidget(n, "vae_count")?.value,
                w.value === "VAE Names",
            );
        },
        vae_count: (n, w) =>
            handleGenericRange(
                n,
                "vae_name_",
                w.value,
                findWidget(n, "input_mode")?.value === "VAE Names",
            ),
    },
    "XY Input: Prompt S/R": {
        replace_count: (n, w) => handleGenericRange(n, "replace_", w.value),
    },
    "XY Input: Checkpoint": {
        input_mode: (n, w) => {
            xyCkptRefinerOptionsRemove(w, n);
            updateGroupVisibility(n, VISIBILITY_MAPS[n.comfyClass], w.value);
            handleStacker(
                n,
                findWidget(n, "ckpt_count")?.value,
                "Checkpoint",
                w.value,
            );
        },
        ckpt_count: (n, w) =>
            handleStacker(
                n,
                w.value,
                "Checkpoint",
                findWidget(n, "input_mode")?.value,
            ),
        target_ckpt: (n, w) =>
            xyCkptRefinerOptionsRemove(findWidget(n, "input_mode"), n),
    },
    "XY Input: LoRA": {
        input_mode: (n, w) => {
            updateGroupVisibility(n, VISIBILITY_MAPS[n.comfyClass], w.value);
            handleStacker(
                n,
                findWidget(n, "lora_count")?.value,
                "LoRA",
                w.value,
            );
        },
        lora_count: (n, w) =>
            handleStacker(
                n,
                w.value,
                "LoRA",
                findWidget(n, "input_mode")?.value,
            ),
    },
    "XY Input: LoRA Plot": {
        input_mode: (n, w) =>
            updateGroupVisibility(n, VISIBILITY_MAPS[n.comfyClass], w.value),
    },
    "XY Input: LoRA Stacks": {
        node_state: (n, w) => toggleWidget(n, w, false),
    },
    "XY Input: Control Net": {
        target_parameter: (n, w) =>
            updateGroupVisibility(n, VISIBILITY_MAPS[n.comfyClass], w.value),
    },
    "XY Input: Control Net Plot": {
        plot_type: (n, w) =>
            updateGroupVisibility(n, VISIBILITY_MAPS[n.comfyClass], w.value),
    },
    "Noise Control Script": {
        add_seed_noise: (n, w) => {
            const s = w.value === true;
            toggleWidget(n, findWidget(n, "seed"), s);
            toggleWidget(n, findWidget(n, "weight"), s);
            ensureSeedControl(n, (btn) => {
                toggleWidget(n, btn, s);
                btn.disabled = !s;
            });
            resizeNode(n);
        },
    },
    "HighRes-Fix Script": {
        upscale_type: (n) => handleHiRes(n),
        use_same_seed: (n) => handleHiRes(n),
        use_controlnet: (n) => handleHiRes(n),
    },
    "Tiled Upscaler Script": {
        use_controlnet: (n, w) => {
            toggleWidgets(n, ["tile_controlnet", "strength"], w.value === true);
            resizeNode(n);
        },
    },
};

// --- Extension Registration ---

app.registerExtension({
    name: "efficiency.widgethider",
    nodeCreated(node) {
        const nodeHandlers = HANDLERS[node.comfyClass];
        if (!nodeHandlers) return;



        // Initialize last computed height to prevent unnecessary resizing on first load
        if (node.computeSize) {
            node._lastComputedHeight = node.computeSize()[1];
        }

        const origConfigure = node.configure;
        node.configure = function () {
            node.is_configuring = true;
            const r = origConfigure
                ? origConfigure.apply(this, arguments)
                : undefined;

            // Trigger handlers to update visibility based on loaded values
            for (const w of node.widgets || []) {
                if (nodeHandlers[w.name]) {
                    nodeHandlers[w.name](node, w);
                }
            }

            node.is_configuring = false;

            // Force resize for HighRes-Fix Script to fix initialization size issue
            if (node.comfyClass === "HighRes-Fix Script") {
                resizeNode(node);
            }

            return r;
        };

        for (const w of node.widgets || []) {
            if (nodeHandlers[w.name]) {
                const descriptor = Object.getOwnPropertyDescriptor(w, "value");
                let val = w.value;

                Object.defineProperty(w, "value", {
                    get() {
                        return descriptor?.get ? descriptor.get.call(w) : val;
                    },
                    set(newVal) {
                        if (descriptor?.set) descriptor.set.call(w, newVal);
                        else val = newVal;

                        const h = nodeHandlers[w.name];
                        if (h) h(node, w);
                    },
                });

                // Initial trigger
                nodeHandlers[w.name](node, w);
            }
        }
    },
});
