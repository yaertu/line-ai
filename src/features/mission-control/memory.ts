export type MemoryCategory =
	| "architecture"
	| "technologies"
	| "important_files"
	| "apis"
	| "decisions"
	| "bugs"
	| "deployments"
	| "tests"
	| "dependencies";

export type ProjectMemoryItem = {
	id: string;
	category: MemoryCategory;
	title: string;
	value: string;
	evidenceIds: string[];
};

export const upsertMemoryItem = (
	items: ProjectMemoryItem[],
	item: ProjectMemoryItem,
): ProjectMemoryItem[] => {
	if (item.evidenceIds.length === 0) {
		throw new Error("Proje hafızası için en az bir kanıt gerekir");
	}
	const existing = items.findIndex((candidate) => candidate.id === item.id);
	if (existing < 0) return [...items, item];
	return items.map((candidate, index) => (index === existing ? item : candidate));
};

