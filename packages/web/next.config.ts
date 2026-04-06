import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	transpilePackages: ["@apogee/shared"],
	webpack: (config) => {
		// Resolve .js imports to .ts files in workspace packages (Bun convention)
		config.resolve.extensionAlias = {
			".js": [".ts", ".tsx", ".js"],
		};
		return config;
	},
};

export default nextConfig;
