export type LineDiffKind = "added" | "context" | "removed";

export type LineDiffRow = {
	content: string;
	kind: LineDiffKind;
	newLine: number | null;
	oldLine: number | null;
};

const splitLines = (content: string) =>
	content.length === 0 ? [] : content.replace(/\r\n?/g, "\n").split("\n");

const lcsLengths = (left: string[], right: string[]) => {
	let previous = new Uint32Array(right.length + 1);
	for (const leftLine of left) {
		const current = new Uint32Array(right.length + 1);
		for (let index = 1; index <= right.length; index += 1) {
			current[index] =
				leftLine === right[index - 1]
					? previous[index - 1] + 1
					: Math.max(previous[index], current[index - 1]);
		}
		previous = current;
	}
	return previous;
};

// Hirschberg's algorithm keeps exact LCS behavior while using linear memory.
const longestCommonSubsequence = (
	left: string[],
	right: string[],
): string[] => {
	if (left.length === 0 || right.length === 0) return [];
	if (left.length === 1) {
		return right.includes(left[0]) ? [left[0]] : [];
	}

	const middle = Math.floor(left.length / 2);
	const leftHalf = left.slice(0, middle);
	const rightHalf = left.slice(middle);
	const forward = lcsLengths(leftHalf, right);
	const backward = lcsLengths(
		[...rightHalf].reverse(),
		[...right].reverse(),
	);
	let split = 0;
	let bestLength = -1;
	for (let index = 0; index <= right.length; index += 1) {
		const length = forward[index] + backward[right.length - index];
		if (length > bestLength) {
			bestLength = length;
			split = index;
		}
	}

	return [
		...longestCommonSubsequence(leftHalf, right.slice(0, split)),
		...longestCommonSubsequence(rightHalf, right.slice(split)),
	];
};

export const buildLineDiff = (
	previousContent: string,
	currentContent: string,
): LineDiffRow[] => {
	const previousLines = splitLines(previousContent);
	const currentLines = splitLines(currentContent);
	const commonLines = longestCommonSubsequence(previousLines, currentLines);
	const rows: LineDiffRow[] = [];
	let previousIndex = 0;
	let currentIndex = 0;

	for (const commonLine of commonLines) {
		while (previousLines[previousIndex] !== commonLine) {
			rows.push({
				content: previousLines[previousIndex],
				kind: "removed",
				newLine: null,
				oldLine: previousIndex + 1,
			});
			previousIndex += 1;
		}
		while (currentLines[currentIndex] !== commonLine) {
			rows.push({
				content: currentLines[currentIndex],
				kind: "added",
				newLine: currentIndex + 1,
				oldLine: null,
			});
			currentIndex += 1;
		}
		rows.push({
			content: commonLine,
			kind: "context",
			newLine: currentIndex + 1,
			oldLine: previousIndex + 1,
		});
		previousIndex += 1;
		currentIndex += 1;
	}

	while (previousIndex < previousLines.length) {
		rows.push({
			content: previousLines[previousIndex],
			kind: "removed",
			newLine: null,
			oldLine: previousIndex + 1,
		});
		previousIndex += 1;
	}
	while (currentIndex < currentLines.length) {
		rows.push({
			content: currentLines[currentIndex],
			kind: "added",
			newLine: currentIndex + 1,
			oldLine: null,
		});
		currentIndex += 1;
	}

	return rows;
};
