# Workspace frontend conventions

MiCole web uses React and Vite. Android/iOS live in a separate Expo checkout.

## Load feature code when needed

`src/features/lazyWorkspaceFeatures.ts` declares optional workspace screens at module scope with explicit import paths. Keep shared controls, authorization and the workspace shell eager. Add a heavy, independent screen to this registry when it does not need to run on every initial visit. Do not move shared domain helpers behind a lazy component or declare lazy components during render.

`src/components/FeatureBoundary.tsx` composes an error boundary and Suspense around its children. The caller supplies the screen label and actual content. Loading and import failures stay inside the page; navigation, institutional identity and the existing palette remain available. The workspace resets the boundary on page, institution, identity or role changes. Reloading retries a failed module download.

Errors from requests or event handlers still need the feature's existing error handling; an error boundary does not replace it. Avoid adding mode booleans or a universal screen configuration object when children can express the composition.

## Validate the improvement

Compare the production manifest's static JavaScript dependency graph before and after changing imports; a smaller individual chunk alone does not prove less initial download. Keep initial-load savings distinct from the total code eventually downloaded across all features.

Run the configured Vitest suite for shared changes and `npm run build`. Check deferred loading, slow/failed downloads, navigation recovery and relevant desktop/mobile layouts in a browser. Do not add memoization everywhere without identifying expensive work or unstable dependencies.

References: [React lazy](https://react.dev/reference/react/lazy), [React Suspense](https://react.dev/reference/react/Suspense).
