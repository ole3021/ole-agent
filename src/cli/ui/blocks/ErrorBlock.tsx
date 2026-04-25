import type { TranscriptBlock } from "../../store/tui-store";
import { Alert } from "../components/ui/alert";

type Props = {
	block: Extract<TranscriptBlock, { type: "error" }>;
};

export const ErrorBlock = ({ block }: Props) => (
	<Alert variant={block.message === "[aborted]" ? "warning" : "error"} bordered>
		{block.message}
	</Alert>
);
