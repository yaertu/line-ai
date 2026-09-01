type ChromeMarkProps = {
	"aria-hidden"?: boolean | "true" | "false";
	className?: string;
	size?: number;
};

const ChromeMark = ({ className, size = 16, ...props }: ChromeMarkProps) => (
	<svg
		className={className}
		fill="none"
		height={size}
		viewBox="0 0 24 24"
		width={size}
		xmlns="http://www.w3.org/2000/svg"
		{...props}
	>
		<path d="M12 2a10 10 0 0 1 8.66 5H12a5 5 0 0 0-4.33 2.5L4.78 4.5A9.96 9.96 0 0 1 12 2Z" fill="#EA4335" />
		<path d="M20.66 7A10 10 0 0 1 12 22l4.33-7.5A5 5 0 0 0 12 7h8.66Z" fill="#34A853" />
		<path d="M12 22A10 10 0 0 1 4.78 4.5l4.33 7.5A5 5 0 0 0 16.33 14.5L12 22Z" fill="#FBBC05" />
		<circle cx="12" cy="12" fill="white" r="5" />
		<circle cx="12" cy="12" fill="#4285F4" r="3.65" />
	</svg>
);

export default ChromeMark;
