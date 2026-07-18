type Variant = "green" | "blue" | "purple" | "yellow" | "gray" | "red";

const cls: Record<Variant, string> = {
    green:  "bg-green-100 text-green-800",
    blue:   "bg-blue-100 text-blue-800",
    purple: "bg-purple-100 text-purple-800",
    yellow: "bg-yellow-100 text-yellow-800",
    gray:   "bg-gray-100 text-gray-700",
    red:    "bg-red-100 text-red-800",
};

export default function Badge({
    text,
    variant = "gray",
}: {
    text: string;
    variant?: Variant;
}) {
    return (
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${cls[variant]}`}>
            {text}
        </span>
    );
}
