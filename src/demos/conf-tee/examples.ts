// The four example pairs from conf-tee's examples/ folder, smallest to richest,
// with the descriptions from its examples/README.md.
const golden = import.meta.glob<string>("./examples/golden/*.txt", { query: "?raw", import: "default", eager: true });
const user = import.meta.glob<string>("./examples/user/*.txt", { query: "?raw", import: "default", eager: true });

const pair = (file: string, label: string, description: string) => ({
    key: file,
    label,
    description,
    golden: golden[`./examples/golden/${file}`],
    user: user[`./examples/user/${file}`],
});

export const examples = [
    pair("test_file_one_line_bad.txt", "One bad line (3 lines)",
        "The smallest possible failure: one line, one value that does not match its variable's type."),
    pair("test_file_one_section_bad.txt", "One bad section (12 lines)",
        "One section, four kinds of finding at once: wrong values, a value that contradicts itself elsewhere, a missing line, and commands that differ."),
    pair("add a user vlan in blg rt-hsrp network type 6.txt", "Clean production config (73 lines)",
        "A real production-shaped config that fully conforms. The useful shape of a clean run."),
    pair("test_file_structure_bad.txt", "Every finding type (49 lines)",
        "Every category the tool reports, including structural mismatches where sections appear in the wrong place."),
];

// Infrastructure prefixes of the sample corpus, from examples/sample_corpus.py
// in the conf-tee repo. They describe these example configs and no others, so
// they are passed to the engine only while an unedited example is selected.
export const SAMPLE_INFRA_PREFIXES = {
    "TEST_CONTEXT_1-FWGLUE": { prefix: "10.45.54.24/29", prefix_type: "fwglue" },
    "TEST_O-VRFGLUE=TEST-TEST_VRF_1": { prefix: "10.45.54.208/29", prefix_type: "vrfglue" },
    "TEST U-TEST_PREFIX_1=TEST_VRF_1": { prefix: "10.45.54.24/29", prefix_type: "user" },
    "TEST U-TEST_PREFIX_2=TEST_VRF_1": { prefix: "10.45.54.24/29", prefix_type: "user" },
};
