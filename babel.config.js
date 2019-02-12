const { NODE_ENV = 'development' } = process.env;
const presetEnvOptions = NODE_ENV === 'production' ? {} : {
  targets: {
    node: true,
  },
};


module.exports = {
  presets: [
    [
      '@babel/preset-env',
      presetEnvOptions,
    ],
  ],
};
