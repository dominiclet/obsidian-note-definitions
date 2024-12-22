module.exports = {
    preset: "ts-jest",
    testEnvironment: "node",
	transform: {
		'^.+\\.ts$': 'ts-jest',
	},
	moduleDirectories: ["node_modules", "<rootDir>"],
	moduleFileExtensions: ["ts", "js"],
	roots: ["<rootDir>"],
	modulePaths: ["<rootDir>"],
};
