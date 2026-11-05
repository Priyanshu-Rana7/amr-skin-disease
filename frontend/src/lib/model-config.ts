// The existing MDR artifact was trained on case years 2019–2021.
// The academic demo records the entered year but runs inference at the latest
// training year so the model never receives an out-of-range value.
export const MDR_MODEL_YEAR = 2021;
