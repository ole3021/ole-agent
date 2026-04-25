import type { TranscriptBlock } from "../../store/tui-store";
import { ThinkingBlock as TermThinkingBlock } from "../components/ui/thinking-block";

type Props = {
	block: Extract<TranscriptBlock, { type: "reasoning" }>;
};

const scopeLabel = (scope: Props["block"]["scope"]): string =>
	typeof scope === "string" ? "Reasoning" : `Reasoning · ${scope.sub}`;

export const ThinkingBlock = ({ block }: Props) => (
	<TermThinkingBlock
		content={block.text}
		streaming={block.streaming}
		defaultCollapsed
		label={scopeLabel(block.scope)}
	/>
);
