# Frontend design source

The frontend uses the actual React components from `animal-island-ui` and icons from `naive-icons`.

Implementation follows the upstream skill:
https://github.com/guokaigdg/animal-island-ui/blob/main/skills/animal-island-ui-style/SKILL.md

References used: `references/react-project.md` and the component prop references for layout, form controls, feedback, decoration, overlays, and data display. Installed package TypeScript declarations take precedence over prose when props differ.

- `Button`, `Card`, `Title`, `Input`, `Select`, `Tag`, `Progress`, `Avatar`, `Background`, `Divider`, `Footer`, `Time`, and `Modal` are library components.
- Styles are imported once with `import 'animal-island-ui/style'`.
- Nunito / Noto Sans SC fonts are bundled locally; no external font service is required.
- Application layout and textarea styling use the library's `--animal-*` tokens.
- The homepage island scene is composed of official `naive-icons` components, not copied game artwork.
- Confirmation dialogs use `Modal variant="game"`, preserving the organic frame.
- The original UI library and icon licenses are included beside this document.

The frontend bundle is built at image build time. The running service remains a single Go binary; React adds no Node.js process to the server.
