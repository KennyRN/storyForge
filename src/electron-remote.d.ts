declare module "@electron/remote" {
	export const dialog: {
		showOpenDialog(options: {
			properties: Array<"openFile" | "openDirectory" | "multiSelections">;
		}): Promise<{ canceled: boolean; filePaths: string[] }>;
	};
}