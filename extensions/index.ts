/**
 * pi-emacs Extension
 *
 * Evaluates Emacs Lisp code via emacsclient CLI.
 * Supports heredoc-style code input with proper error handling.
 */

import { Type } from "@mariozechner/pi-ai";
import { defineTool, type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

interface EmacsResult {
	stdout: string;
	stderr: string;
	exitCode: number;
	killed: boolean;
}

interface EmacsEvalResult {
	stdout?: string;
	stderr?: string;
	errors?: string;
	expanded?: string;
	success: boolean;
}

const emacsEvalTool = defineTool({
	name: "emacs_eval",
	label: "Emacs Eval",
	description:
		"Evaluate Emacs Lisp code using emacsclient. " +
		"Supports heredoc-style code input. " +
		"Returns stdout, stderr, and any evaluation errors.",
	promptSnippet: "Evaluate Emacs Lisp code in running Emacs instance",
	promptGuidelines: [
		"Use emacs_eval when the user asks to evaluate Emacs Lisp code",
		"Use emacs_eval to query or modify Emacs state (buffers, variables, modes)",
		"Use emacs_eval to run Emacs commands or interact with Emacs features",
	],
	parameters: Type.Object({
		code: Type.String({
			description: "Emacs Lisp code to evaluate (supports heredoc multi-line input)",
		}),
		timeout: Type.Optional(
			Type.Number({ description: "Timeout in seconds for evaluation (default: 30)" }),
		),
		noWait: Type.Optional(
			Type.Boolean({ description: "Don't wait for Emacs server response (fire and forget)" }),
		),
		quiet: Type.Optional(
			Type.Boolean({ description: "Suppress success messages from emacsclient" }),
		),
		socketName: Type.Optional(
			Type.String({ description: "Emacs socket name (default: use default server)" }),
		),
	}),

	async execute(_toolCallId, params, _signal, _onUpdate, _ctx): Promise<{
		content: Array<{ type: "text"; text: string }>;
		details: EmacsEvalResult;
	}> {
		const result: EmacsEvalResult = { success: true };

		const args: string[] = [];
		if (params.socketName) {
			args.push("--socket-name", params.socketName);
		}
		if (params.noWait) {
			args.push("--no-wait");
		}
		if (params.quiet) {
			args.push("--quiet");
		} else {
			args.push("--eval");
		}
		if (params.timeout) {
			args.push("--timeout", String(params.timeout));
		}
		args.push(params.code);

		try {
			const { stdout, stderr } = await execFileAsync("emacsclient", args, {
				timeout: params.timeout ? params.timeout * 1000 + 5000 : 30000,
			});
			result.stdout = stdout.trim() || undefined;
			result.stderr = stderr.trim() || undefined;
		} catch (error: unknown) {
			if (error && typeof error === "object" && "killed" in error) {
				const execError = error as { killed: boolean; code?: number; stderr?: string; stdout?: string };
				result.stdout = execError.stdout?.trim() || undefined;
				result.stderr = execError.stderr?.trim() || undefined;
				if (execError.killed) {
					result.errors = `Evaluation timed out after ${params.timeout ?? 30}s`;
					result.success = false;
				} else if (execError.code !== 0) {
					result.errors = `emacsclient exited with code ${execError.code}`;
					result.success = false;
				}
			} else {
				result.errors = error instanceof Error ? error.message : String(error);
				result.success = false;
			}
		}

		// Format the output
		const lines: string[] = [];
		if (result.stdout !== undefined) {
			lines.push(";; Output:");
			lines.push(result.stdout);
		}
		if (result.stderr) {
			lines.push(";; Stderr:");
			lines.push(result.stderr);
		}
		if (result.errors) {
			lines.push(";; Error:");
			lines.push(result.errors);
		}

		return {
			content: [{ type: "text", text: lines.length > 0 ? lines.join("\n") : ";; No output" }],
			details: result,
		};
	},
});

export default function (pi: ExtensionAPI): void {
	pi.registerTool(emacsEvalTool);
}