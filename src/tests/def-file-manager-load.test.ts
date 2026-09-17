import { DefManager } from "src/core/def-file-manager";

jest.mock("src/util/log");

function deferred() {
	let resolve!: () => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<void>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function createManager() {
	const manager = Object.create(DefManager.prototype) as any;
	manager.loadPromise = null;
	manager.reloadRequested = false;
	manager.updateRequested = false;
	manager.reset = jest.fn();
	manager.updateActiveFile = jest.fn();
	manager.loadGlobals = jest.fn().mockResolvedValue(undefined);
	manager.runUpdatedFileLoad = jest.fn().mockResolvedValue(undefined);
	return manager;
}

describe("DefManager definition load coordination", () => {
	it("coalesces a synchronous burst before starting work", async () => {
		const manager = createManager();
		const active = manager.loadDefinitions();
		for (let i = 0; i < 20; i++)
			expect(manager.loadDefinitions()).toBe(active);
		await active;
		expect(manager.loadGlobals).toHaveBeenCalledTimes(1);
	});

	it("coalesces requests during a running pass into one trailing reload", async () => {
		const manager = createManager();
		const first = deferred();
		manager.loadGlobals.mockReturnValueOnce(first.promise);
		const active = manager.loadDefinitions();
		await Promise.resolve();
		for (let i = 0; i < 20; i++)
			expect(manager.loadDefinitions()).toBe(active);
		first.resolve();
		await active;
		expect(manager.loadGlobals).toHaveBeenCalledTimes(2);
		expect(manager.reset).toHaveBeenCalledTimes(2);
	});

	it("includes requests arriving during the trailing pass before resolving", async () => {
		const manager = createManager();
		const first = deferred();
		const trailing = deferred();
		const trailingStarted = deferred();
		manager.loadGlobals
			.mockReturnValueOnce(first.promise)
			.mockImplementationOnce(() => {
				trailingStarted.resolve();
				return trailing.promise;
			});
		const active = manager.loadDefinitions();
		await Promise.resolve();
		manager.loadDefinitions();
		first.resolve();
		await trailingStarted.promise;
		expect(manager.loadDefinitions()).toBe(active);
		trailing.resolve();
		await active;
		expect(manager.loadGlobals).toHaveBeenCalledTimes(3);
	});

	it("publishes the lock before synchronous work can request another load", async () => {
		const manager = createManager();
		let reentrant: Promise<void> | undefined;
		manager.reset.mockImplementationOnce(() => {
			reentrant = manager.loadDefinitions();
		});
		const active = manager.loadDefinitions();
		await active;
		expect(reentrant).toBe(active);
		expect(manager.loadGlobals).toHaveBeenCalledTimes(2);
	});

	it.each(["full", "incremental"])(
		"serializes mixed requests while a %s load is active",
		async (kind) => {
			const manager = createManager();
			const first = deferred();
			const order: string[] = [];
			manager.loadGlobals.mockImplementation(() => {
				order.push("full");
				return Promise.resolve();
			});
			manager.runUpdatedFileLoad.mockImplementation(() => {
				order.push("incremental");
				return Promise.resolve();
			});
			const initial =
				kind === "full"
					? manager.loadGlobals
					: manager.runUpdatedFileLoad;
			initial.mockImplementationOnce(() => {
				order.push(kind);
				return first.promise;
			});
			const active =
				kind === "full"
					? manager.loadDefinitions()
					: manager.loadUpdatedFiles();
			await Promise.resolve();
			expect(manager.loadDefinitions()).toBe(active);
			expect(manager.loadUpdatedFiles()).toBe(active);
			expect(order).toEqual([kind]);
			first.resolve();
			await active;
			expect(order).toEqual([kind, "full", "incremental"]);
		},
	);

	it("drains queued work after a failure, rejects callers, and permits a fresh attempt", async () => {
		const manager = createManager();
		const first = deferred();
		const error = new Error("read failed");
		manager.loadGlobals.mockReturnValueOnce(first.promise);
		const active = manager.loadDefinitions();
		const rejection = expect(active).rejects.toBe(error);
		await Promise.resolve();
		expect(manager.loadDefinitions()).toBe(active);
		expect(manager.loadUpdatedFiles()).toBe(active);
		first.reject(error);
		await rejection;
		expect(manager.loadGlobals).toHaveBeenCalledTimes(2);
		expect(manager.runUpdatedFileLoad).toHaveBeenCalledTimes(1);
		const next = manager.loadDefinitions();
		expect(next).not.toBe(active);
		await expect(next).resolves.toBeUndefined();
	});

	it("releases the lock after a synchronous failure", async () => {
		const manager = createManager();
		manager.reset.mockImplementationOnce(() => {
			throw new Error("reset failed");
		});
		await expect(manager.loadDefinitions()).rejects.toThrow("reset failed");
		await expect(manager.loadDefinitions()).resolves.toBeUndefined();
	});

	it("accepts requests at completion and from completion callbacks", async () => {
		const manager = createManager();
		manager.updateActiveFile.mockImplementationOnce(() => {
			manager.loadDefinitions();
		});
		const active = manager.loadDefinitions();
		await active.then(() => manager.loadDefinitions());
		expect(manager.loadGlobals).toHaveBeenCalledTimes(3);
	});

	it("preserves files marked dirty during an incremental read and its starting timestamp", async () => {
		const manager = createManager();
		delete manager.runUpdatedFileLoad;
		const first = { path: "first.md", stat: { mtime: 10 } };
		// Explicitly dirty files must be read even with an old timestamp.
		const added = { path: "added.md", stat: { mtime: 5 } };
		manager.globalDefFiles = new Map([[first.path, first]]);
		manager.markedDirty = [];
		manager.lastUpdate = 10;
		manager.globalDefs = { clearForFile: jest.fn(), set: jest.fn() };
		manager.buildPrefixTree = jest.fn();
		const read = deferred();
		manager.parseFile = jest
			.fn()
			.mockImplementationOnce(async () => {
				await read.promise;
				return [];
			})
			.mockResolvedValue([]);
		const now = jest.spyOn(Date, "now").mockReturnValue(15);
		try {
			const active = manager.loadUpdatedFiles();
			await Promise.resolve();
			manager.markDirty(added);
			now.mockReturnValue(30);
			read.resolve();
			await active;
			expect(manager.markedDirty).toEqual([added]);
			expect(manager.lastUpdate).toBe(15);
			await manager.loadUpdatedFiles();
			expect(
				manager.parseFile.mock.calls.map((args: any[]) => args[0].path),
			).toEqual(["first.md", "added.md"]);
		} finally {
			now.mockRestore();
		}
	});
});
