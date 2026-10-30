import defaultMd from "./resume.md?raw";
import frontEndMd from "./resume-front-end.md?raw";

// canonical key → markdown content (also determines PDF filename: resume-<key>.pdf)
export const canonicalVariants: Record<string, string> = {
    "front-end": frontEndMd,
};

// URL ?aud= aliases → canonical key
export const audAliases: Record<string, string> = {
    "fe": "front-end",
};

// Every variant is prerendered into the page; key "" is the default resume.
// ResumeVariantSelect.astro picks the visible one from ?aud= in the browser.
export const resumeVariants = [
    { key: "", md: defaultMd },
    ...Object.entries(canonicalVariants).map(([key, md]) => ({ key, md })),
];
