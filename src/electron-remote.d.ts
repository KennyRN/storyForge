declare module "electron" {
	export const dialog: {
		showOpenDialog(options: {
			properties: Array<"openFile" | "openDirectory" | "multiSelections">;
		}): Promise<{ canceled: boolean; filePaths: string[] }>;
	};
}