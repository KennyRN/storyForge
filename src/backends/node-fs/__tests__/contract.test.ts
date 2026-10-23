import { describeBackendContract } from "../../../../test/backendContract";
import { NodeFsBackend } from "../index";

describeBackendContract("node-fs", async (root) => ({ backend: new NodeFsBackend(root), close: () => undefined }));
