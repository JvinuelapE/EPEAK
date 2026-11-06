import { createRoot } from "react-dom/client";
import { App } from "./shell/App";
import { boot } from "./shell/actions";
import "./styles.css";

boot();
createRoot(document.getElementById("root")!).render(<App />);
