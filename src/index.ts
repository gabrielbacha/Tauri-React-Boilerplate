import "./styles/global.css";
import { installDesktopApi } from "./platform/desktop";
import { installErrorLog } from "./platform/error-log";
import { installWindowDrag } from "./platform/window-drag";

const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
document.documentElement.classList.toggle("dark", dark);
document.documentElement.style.colorScheme = dark ? "dark" : "light";

installErrorLog();
installDesktopApi();
installWindowDrag();
void import("./App");
