import type {
	TraceSession,
	VerificationCriterion,
	VerificationResult,
} from "./types";

export const calculateResult = (
	session: TraceSession,
	criteria: VerificationCriterion[],
): VerificationResult => {
	const required = criteria.filter((criterion) => criterion.required);
	const failed = required
		.filter((criterion) =>
			session.evidence.some(
				(evidence) =>
					evidence.criterionIds?.includes(criterion.id) &&
					evidence.status === "failed",
			),
		)
		.map((criterion) => criterion.id);
	const passed = required.filter((criterion) =>
		session.evidence.some(
			(evidence) =>
				evidence.criterionIds?.includes(criterion.id) &&
				evidence.status === "passed",
		),
	);
	const missing = required
		.filter(
			(criterion) =>
				!passed.some((item) => item.id === criterion.id) &&
				!failed.includes(criterion.id),
		)
		.map((criterion) => criterion.id);

	if (session.status === "failed" || failed.length > 0) {
		return { failed, missing, passed: passed.length, status: "failed", total: required.length };
	}
	if (session.status === "blocked") {
		return { failed, missing, passed: passed.length, status: "blocked", total: required.length };
	}
	if (required.length > 0 && passed.length === required.length) {
		return { failed, missing, passed: passed.length, status: "verified", total: required.length };
	}
	if (passed.length > 0) {
		return {
			failed,
			missing,
			passed: passed.length,
			status: "partially_verified",
			total: required.length,
		};
	}
	return { failed, missing, passed: 0, status: "unverified", total: required.length };
};

