import { Box, Text } from "ink";
import React from "react";
import { useTuiStore } from "../../store/tui-store";

interface Props {
	children: React.ReactNode;
}

interface State {
	hasError: boolean;
	errorMessage: string | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
	constructor(props: Props) {
		super(props);
		this.state = { hasError: false, errorMessage: null };
	}

	static getDerivedStateFromError(error: Error): State {
		return { hasError: true, errorMessage: error.message };
	}

	componentDidCatch(error: Error, _info: React.ErrorInfo) {
		useTuiStore.getState().setGlobalError(error.message);
	}

	render() {
		if (this.state.hasError) {
			return (
				<Box
					flexDirection="column"
					borderStyle="round"
					borderColor="red"
					paddingX={1}
					paddingY={1}
				>
					<Text bold color="red">
						UI Error
					</Text>
					<Text color="red" dimColor>
						{this.state.errorMessage}
					</Text>
					<Text dimColor>Press Ctrl+D to restart</Text>
				</Box>
			);
		}
		return this.props.children;
	}
}
