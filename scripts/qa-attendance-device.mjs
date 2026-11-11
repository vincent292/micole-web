// ADB helper for the explicitly authorized MiCole QA session. Never prints passwords.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const [action, ...args] = process.argv.slice(2);
const adb = (...a) => execFileSync("adb", a, { maxBuffer: 8 * 1024 * 1024 });
const shellQuote = (s) => "'" + s.replace(/'/g, "'\\''") + "'";
const enter = (value) =>
  adb("shell", "input text " + shellQuote(value.replace(/ /g, "%s")));
const decode = (s) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
if (action === "show") {
  try {
    adb("shell", "uiautomator", "dump", "/sdcard/micole-attendance.xml");
  } catch(error) {
    if(error.status!==137 || !error.stdout?.toString().includes("UI hierchary dumped to: /sdcard/micole-attendance.xml")) throw error;
  }
  const xml = adb(
    "exec-out",
    "cat",
    "/sdcard/micole-attendance.xml",
  ).toString();
  const nodes = [...xml.matchAll(/<node\b[^>]+>/g)].map(([s]) =>
    Object.fromEntries(
      [...s.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, k, v]) => [k, decode(v)]),
    ),
  );
  const allowed = new Set([
    "com.micole.android",
    "com.android.chrome",
    "com.android.permissioncontroller",
    "com.google.android.permissioncontroller",
  ]);
  const visible = nodes.filter(
    (n) =>
      allowed.has(n.package) &&
      (n.text || n["content-desc"] || n.class?.endsWith("EditText")) &&
      (!args[0] ||
        new RegExp(args[0], "i").test(n.text + " " + n["content-desc"])),
  );
  console.log(
    JSON.stringify(
      visible.map((n) => ({
        text: n.password === "true" ? "[password hidden]" : n.text,
        description: n["content-desc"],
        bounds: n.bounds,
        enabled: n.enabled,
        checked: n.checked,
        class: n.class,
      })),
      null,
      2,
    ),
  );
} else if (action === "tap") adb("shell", "input", "tap", ...args);
else if (action === "swipe") adb("shell", "input", "swipe", ...args);
else if (action === "key") adb("shell", "input", "keyevent", ...args);
else if (action === "hide-input") {
  for (let i=0;i<3;i++) {
    const focus=adb("shell","dumpsys","window").toString().split("\n").find(line=>line.includes("mCurrentFocus="))||"";
    const keyboard=adb("shell","dumpsys","input_method").toString();
    if(!focus.includes("Autofill UI")&&!/mInputShown=true/.test(keyboard)) break;
    adb("shell","input","keyevent","4");
  }
  console.log("Input overlays dismissed; autofill settings unchanged.");
}
else if (action === "clear") {
  adb("shell", "input", "keyevent", "123");
  adb("shell", "input", "keyevent", ...Array(120).fill("67"));
} else if (action === "text") enter(args[0]);
else if (action === "credential") {
  const qa = JSON.parse(
    fs.readFileSync(
      path.join(os.homedir(), ".config/micole/cuentas-pruebas-ampliadas.json"),
    ),
  );
  const a = qa.accounts.find((a) => a.key === args[0]);
  if (!a) throw Error("Unknown QA account");
  const value = args[1] === "email" ? a.email : qa.password;
  enter(value);
  console.log(
    JSON.stringify({
      entered: args[1] === "email" ? "QA email" : "QA password",
      account: args[0],
    }),
  );
} else if (action === "shot") {
  const focus = adb("shell", "dumpsys", "window").toString().split("\n").find(line=>line.includes("mCurrentFocus=")) || "";
  if (!/com\.micole\.android|com\.android\.chrome/.test(focus))
    throw Error("Screenshot skipped: MiCole/Chrome is not the focused surface.");
  const outputBase = path.resolve(process.env.MICOLE_QA_OUTPUT || "output/qa/2026-10-29-asistencia");
  if (!outputBase.startsWith(path.resolve("output/qa")+path.sep)) throw Error("Invalid QA folder");
  const destination = path.resolve(
    outputBase,
    args[0] + ".png",
  );
  if (
    !destination.startsWith(
      outputBase + path.sep,
    )
  )
    throw Error("Invalid output");
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, adb("exec-out", "screencap", "-p"));
  console.log(destination);
} else throw Error("Unsupported QA action");
