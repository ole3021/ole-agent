import "../util/env";
import { render } from "ink";
import { createElement } from "react";
import { isWorkspaceRootValid, workspaceRoot } from "../config/workspace-root";
import { CliApp } from "./app";

if (!isWorkspaceRootValid()) {
	console.error(`Workspace root does not exist: ${workspaceRoot}`);
	process.exit(1);
}

process.stdout.write("\u001B[?1049h");
const app = render(createElement(CliApp), { exitOnCtrlC: false });
const teardown = () => {
	process.stdout.write("\u001B[?1049l");
};

app.waitUntilExit().finally(teardown);
