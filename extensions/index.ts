// SPDX-License-Identifier: EPL-2.0
// Copyright © 2026-present Marko Kocic <marko@euptera.com>

/**
 * pi-emacs Extension
 *
 * Evaluates Emacs Lisp code via emacsclient CLI.
 * Supports heredoc-style code input with proper error handling.
 */

import { Type } from "@sinclair/typebox";
import { Text } from "@mariozechner/pi-tui";
import { defineTool, type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

interface EmacsEvalResult {
	code?: string;
	vals?: string[];
	err?: string;
	out?: string;
	error?: string;
}

const emacsEvalTool = defineTool({
	name: "emacs_eval",
	label: "Emacs Eval",
	description:
		"Evaluate Emacs Lisp code using emacsclient. " +
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
		isError?: boolean;
	}> {
		const result: EmacsEvalResult = { code: params.code };

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

			const stdoutTrimmed = stdout.trim();
			const stderrTrimmed = stderr.trim();

			// stdout contains the evaluation result (like vals in Clojure)
			if (stdoutTrimmed) {
				result.vals = stdoutTrimmed.split("\n").filter((l) => l.length > 0);
			}
			// stderr contains error output
			if (stderrTrimmed) {
				result.err = stderrTrimmed;
			}
		} catch (error: unknown) {
			if (error && typeof error === "object" && "killed" in error) {
				const execError = error as { killed: boolean; code?: number; stderr?: string; stdout?: string };
				if (execError.killed) {
					result.error = `Evaluation timed out after ${params.timeout ?? 30}s`;
				} else if (execError.code !== 0) {
					result.error = `emacsclient exited with code ${execError.code}`;
				}
				if (execError.stderr?.trim()) {
					result.err = execError.stderr.trim();
				}
			} else {
				result.error = error instanceof Error ? error.message : String(error);
			}
		}

		// Format the output
		const lines: string[] = [];
		lines.push(params.code);

		if (result.vals && result.vals.length > 0) {
			lines.push(`=> ${result.vals.join("\n=> ")}`);
		}

		if (result.out) {
			lines.push(`stdout: ${result.out}`);
		}

		if (result.err) {
			lines.push(`stderr: ${result.err}`);
		}

		const text = lines.join("\n");

		return {
			content: [{ type: "text", text }],
			details: result,
			isError: !!result.error || !!result.err,
		};
	},

	renderCall(args, _theme, _context) {
		const code = args.code as string;
		const firstLine = code.split("\n")[0]!;
		const display = firstLine.length > 50 ? firstLine.slice(0, 50) + "..." : firstLine;
		return new Text(`elisp> ${display}`, 0, 0);
	},

	renderResult(result, { expanded }, theme, _context) {
		const details = result.details as EmacsEvalResult | undefined;
		if (!details) {
			const text = result.content[0];
			return new Text(text?.type === "text" ? text.text : "", 0, 0);
		}

		const lines: string[] = [];
		let lineCount = 0;

		// Error case
		if (details.err || details.error) {
			const errMsg = details.err || details.error || "";
			const firstErrLine = errMsg.split("\n")[0] ?? errMsg;
			if (expanded) {
				lines.push(theme.fg("muted", details.code ?? ""));
				lines.push(theme.fg("error", `stderr: ${errMsg}`));
				lineCount = lines.length;
			} else {
				return new Text(theme.fg("error", `stderr: ${firstErrLine}`), 0, 0);
			}
		} else {
			// Show code in muted
			lines.push(theme.fg("muted", details.code ?? ""));
			lineCount++;

			// Show vals (return values)
			if (details.vals && details.vals.length > 0) {
				const valStr = details.vals.join("\n=> ");
				if (expanded) {
					lines.push(theme.fg("accent", `=> ${valStr}`));
					lineCount += details.vals.length;
				} else {
					// Collapsed: show first value only
					lines.push(
						theme.fg("accent", `=> ${details.vals[0]}${details.vals.length > 1 ? " ..." : ""}`),
					);
					lineCount++;
				}
			}

			// Show stdout (additional output, not the return value)
			if (details.out) {
				const outLines = details.out.split("\n");
				if (expanded) {
					lines.push(theme.fg("success", `stdout: ${details.out}`));
					lineCount += outLines.length;
				} else {
					lines.push(
						theme.fg("success", `stdout: ${outLines[0]}${outLines.length > 1 ? " ..." : ""}`),
					);
					lineCount++;
				}
			}
		}

		const text = lines.join("\n");
		const MAX_LINES = 20;
		const textLines = text.split("\n");

		if (expanded || textLines.length <= MAX_LINES) {
			return new Text(text, 0, 0);
		}

		const visible = textLines.slice(0, MAX_LINES - 1).join("\n");
		const remaining = textLines.length - (MAX_LINES - 1);
		return new Text(
			visible + "\n" + theme.fg("dim", `... ${remaining} more lines (Ctrl+O to expand)`),
			0,
			0,
		);
	},
});

export default function (pi: ExtensionAPI): void {
	pi.registerTool(emacsEvalTool);
}
