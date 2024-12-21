module.exports = {
    preset: "ts-jest",
    testEnvironment: "jsdom",
	transform: {
		"^.+\\.(js|jsx|ts|tsx)$": "babel-jest",
		'^.+\\.(ts|tsx|js|jsx)?$': 'ts-jest',
	},
	testPathIgnorePatterns: ["<rootDir>/node_modules/"],
	moduleDirectories: ["node_modules", "<rootDir>"],
	moduleNameMapper: {
		"\\.(css|less|scss)$": "<rootDir>/__mocks__/styleMock.js",
		"^@/(.*)$": "<rootDir>/src/$1",
	},
	moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
	roots: ["<rootDir>"],
	modulePaths: ["<rootDir>"],
	moduleDirectories: ["node_modules", "src", "src/tests"],
	moduleNameMapper: {
		obsidian: '<rootDir>/src/tests/mocks/obsidian.ts'
	}
};
