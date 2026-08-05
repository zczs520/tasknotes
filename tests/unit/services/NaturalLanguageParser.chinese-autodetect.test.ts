import { NaturalLanguageParser } from "../../../src/services/NaturalLanguageParser";

describe("NaturalLanguageParser Chinese date auto-detection", () => {
	it("parses Chinese date and time even when the configured NLP language is English", () => {
		const parser = new NaturalLanguageParser([], [], true, "en");
		const parsed = parser.parseInput("明天下午三点去吃饭");

		expect(parsed.title).toBe("去吃饭");
		expect(parsed.scheduledDate).toBeTruthy();
		expect(parsed.scheduledTime).toBe("15:00");
	});
});
