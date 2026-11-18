# Frontend design source

The frontend uses the actual React components from `animal-island-ui` and icons from `naive-icons`.

Implementation follows the upstream skill:
https://github.com/guokaigdg/animal-island-ui/blob/main/skills/animal-island-ui-style/SKILL.md

References used: `references/react-project.md` and the component prop references for layout, form controls, feedback, decoration, overlays, and data display. Installed package TypeScript declarations take precedence over prose when props differ.

- `Button`, `Card`, `Title`, `Input`, `Select`, `Tag`, `Progress`, `Avatar`, `Background`, `Divider`, `Footer`, `Time`, and `Modal` are library components.
- Styles are imported once with `import 'animal-island-ui/style'`.
- Nunito / Noto Sans SC fonts are bundled locally; no external font service is required.
- Application layout and textarea styling use the library's `--animal-*` tokens.
- Navigation and homepage icons are official `naive-icons` components.
- Confirmation dialogs use `Modal variant="game"`, preserving the organic frame.
- The original UI library and icon licenses are included beside this document.

The frontend bundle is built at image build time. The running service remains a single Go binary; React adds no Node.js process to the server.

## 2026-11 layout revision

The landing page now contains four main destinations, a recent-record list, and compact utility navigation. Body text is 16px, chat text 17–18px, and secondary text at least 14px. Workspaces use the available viewport width. The chat transcript scrolls within a viewport-sized workspace.

Drawnix runs in an authenticated same-origin frame at `/draw/editor`, inside the Animal Island shell at `/draw/`. Its upstream toolbar/icons retain Drawnix's original interface. The portal's navigation and save button use Animal Island components. Drawnix is MIT licensed; see `Drawnix-LICENSE`. The package is pinned to the upstream published `0.4.0-0` version, not the development branch. Its matching Plait dependencies are pinned to 0.89.2.

Mermaid is kept on the compatible, patched 10.9.8 line: the converter calls APIs removed in Mermaid 11. DOMPurify, KaTeX and UUID transitive versions are overridden to patched versions. Browser integration coverage exercises real drawing, save failures/retry, server persistence, Mermaid/Markdown conversion, `.drawnix` export and mobile layout. `npm audit` reports no known vulnerabilities at this revision.
