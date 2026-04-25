import { Box } from "ink";
import type { TranscriptBlock } from "../../store/tui-store";
import { Badge } from "../components/ui/badge";

type Props = {
	block: Extract<TranscriptBlock, { type: "subagent" }>;
};

const statusVariant = (
	status: Props["block"]["status"],
): "info" | "success" | "error" => {
	if (status === "ok") return "success";
	if (status === "error") return "error";
	return "info";
};

export const SubAgentGroup = ({ block }: Props) => (
	<Box marginBottom={1}>
		<Badge variant={statusVariant(block.status)}>
			{`⟐ ${block.agentId} ${block.status}`}
		</Badge>
	</Box>
);
