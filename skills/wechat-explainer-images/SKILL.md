---
name: wechat-explainer-images
description: "Create a coherent 3:4 visual package for a Chinese WeChat article: one attention-first cover plus section explainer infographics, with article-aware planning, reusable warm-cream editorial styling, exact Chinese copy checks, image normalization, and Markdown insertion. Use when the user asks to turn an article or Markdown draft into 微信公众号配图、文章主图、章节信息图、解释型配图, or wants to reuse this specific visual system on another article."
---

# WeChat Explainer Images

Turn a finished or near-finished article into a small visual system, not a pile of decorative pictures. Keep real screenshots as proof; add generated images only where a diagram makes an idea, structure, comparison, or process easier to understand.

## Required workflow

1. Read the source article completely, including frontmatter, headings, tables, screenshots, and existing image links.
2. Read `references/planning-rules.md` and `references/prompt-templates.md` completely before planning or generating.
3. Build a visual plan before making images. For every proposed asset state:
   - filename;
   - insertion point;
   - communication job;
   - exact title, subtitle, labels, and takeaway;
   - main visual metaphor or diagram.
4. Generate one cover and only the section images that materially improve comprehension.
5. Use the built-in image-generation capability, one call per distinct asset.
6. Inspect every result for hierarchy, legibility, exact Chinese text, and content accuracy. Fix errors with a targeted edit or regenerate.
7. Run `scripts/normalize_image.py` on every accepted image so the final file is exactly 1080×1440 without stretching or destructive cropping.
8. Save accepted images in a new versioned folder near the project assets. Do not overwrite existing assets unless the user explicitly asks.
9. Write `prompts.md` beside the images with the final visual plan and prompts actually used.
10. Update the article only after all images pass QA. Use links relative to the article when the project already follows that convention.

## Scope selection

Default to one cover plus one explainer for each major conceptual section that benefits from a visual. Combine adjacent sections when one visual can explain them together. Skip sections that are already clear, purely transitional, or fully demonstrated by a screenshot.

For a long tutorial, a good target is usually one cover plus four to seven explainers. This is a guideline, not a quota.

## Reference assets

Use these bundled files as style references only:

- `assets/cover-style-reference.png` for the cover's visual hierarchy and editorial finish.
- `assets/explainer-style-reference.png` for inline information-card structure.

Tell the image model explicitly that a reference controls style, spacing, palette, outline language, and finish only. Never copy its product names, logos, text, layout objects, or subject matter into the new article.

## Non-negotiable design rules

- Final canvas: 1080×1440, portrait 3:4, for WeChat article use.
- Warm cream technical-paper background with a very subtle blue blueprint grid.
- Engineering blue is primary; warm orange marks the key tension or action; mint green marks completion or safe outcomes; dark navy defines text and rounded outlines.
- Flat editorial infographic, paper-cut depth, restrained shadows, generous margins.
- Each image must communicate one idea at a glance and a second layer on closer reading.
- Use concrete visual flow: input → process → output, before → after, system roles, staged pipeline, or guarded decision.
- Keep Chinese copy short and exact. Prefer 2–8 Chinese characters per label.
- Avoid fake UI, fake screenshots, logos, watermarks, QR codes, tiny body text, excessive decoration, gradients that reduce contrast, and English filler.

## Cover rules

- One large focal object or scene, readable at phone-feed size.
- Strong headline, short supporting line, and at most three small hook labels.
- The visual should create curiosity before explaining the whole article.
- The cover may be more dramatic than inline cards, but must remain in the same visual family.

## Inline explainer rules

- Small eyebrow label, large title, one-line subtitle.
- One central diagram with obvious reading order.
- Three to five concise labels are usually enough.
- End with a bottom takeaway or safety strip that states the section's conclusion.
- Screenshots prove that a step happened; explainers show why the step matters or how pieces relate.

## Quality gate

Reject or revise an image if any of these are true:

- Chinese text is wrong, duplicated, garbled, or clipped.
- The image repeats the paragraph without adding structure.
- The reading order is unclear in three seconds.
- Decorative objects compete with the central idea.
- The result copies visible content from a reference asset.
- The accepted file is not exactly 1080×1440.

After insertion, verify that every linked file exists and that the Markdown still renders in the project's existing style.
