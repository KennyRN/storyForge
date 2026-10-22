import { checkProject } from "../src/cli/checkProject";

const folder = process.argv[2];
if (!folder) {
	console.error("usage: npm run check -- <project folder>");
	process.exit(2);
}
checkProject(folder).then(
	(result) => {
		process.stdout.write(result.report);
		process.exit(result.exitCode);
	},
	(err) => {
		console.error(err);
		process.exit(2);
	},
);
