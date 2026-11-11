import { configDefaults, defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

// Generated mobile build/test copies are independent projects, not root suites.
export default mergeConfig(viteConfig, defineConfig({
  test: { exclude: [...configDefaults.exclude, "tmp/**", "output/**"] },
}));
