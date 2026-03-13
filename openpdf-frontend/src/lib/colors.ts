export const VIBRANT_COLORS = [
    '#FF3B30', '#FF9500', '#FFCC00', '#4CD964',
    '#5AC8FA', '#007AFF', '#5856D6', '#FF2D55',
    '#E57373', '#F06292', '#BA68C8', '#9575CD',
    '#7986CB', '#64B5F6', '#4FC3F7', '#4DD0E1'
];

let colorIndex = 0;

export const getNextColor = () => {
    const color = VIBRANT_COLORS[colorIndex % VIBRANT_COLORS.length];
    colorIndex++;
    return color;
};

// Expose reset for testing or restarting upload loops if needed
export const resetColorCounter = () => {
    colorIndex = 0;
};
