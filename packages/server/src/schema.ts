import SchemaBuilder from "@pothos/core";

export const builder = new SchemaBuilder<{
	Context: Record<string, never>;
}>({});

builder.queryType({
	fields: (t) => ({
		_version: t.string({
			description: "API version",
			resolve: () => "0.0.1",
		}),
	}),
});

export const schema = builder.toSchema();
