import type { TranscriptBlock } from "../../store/tui-store";
import { ChatMessage } from "../components/ui/chat-message";

type Props = {
	block: Extract<TranscriptBlock, { type: "user" }>;
};

export const UserBlock = ({ block }: Props) => (
	<ChatMessage sender="user" name="you">
		{block.text}
	</ChatMessage>
);
