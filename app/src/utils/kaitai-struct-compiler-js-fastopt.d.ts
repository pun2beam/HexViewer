declare const MainJs: {
  compile: (...args: unknown[]) => Promise<Record<string, string>>;
};

export { MainJs };
