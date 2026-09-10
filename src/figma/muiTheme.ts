import { createTheme } from "@mui/material/styles";

// Genesis 设计令牌，与 styles/theme.css 中的 CSS 变量保持一致
const PRIMARY = "#0076DE";
const PRIMARY_HOVER = "#0062BB";
const BORDER = "#E8E8EC";
const TEXT_PRIMARY = "#1A1A1A";
const TEXT_SECONDARY = "#6B7280";

export const muiTheme = createTheme({
  palette: {
    primary: { main: PRIMARY, dark: PRIMARY_HOVER, contrastText: "#FFFFFF" },
    error: { main: "#EF4444" },
    success: { main: "#10B981" },
    text: { primary: TEXT_PRIMARY, secondary: TEXT_SECONDARY },
    divider: BORDER,
  },
  shape: { borderRadius: 6 },
  typography: {
    fontFamily: 'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
    fontSize: 14,
  },
  components: {
    // 全站输入框统一：小尺寸 outlined，focus 3px 靖蓝环
    MuiTextField: {
      defaultProps: { size: "small", variant: "outlined" },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: "#FFFFFF",
          fontSize: 14,
          "& .MuiOutlinedInput-notchedOutline": { borderColor: BORDER },
          "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "#C9CBD1" },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderColor: PRIMARY,
            borderWidth: 1,
          },
          "&.Mui-focused": { boxShadow: "0 0 0 3px rgba(0,118,222,0.12)" },
          "&.Mui-disabled": { backgroundColor: "#F5F6F8" },
        },
        input: { padding: "10px 12px" },
      },
    },
    MuiInputLabel: {
      styleOverrides: { root: { fontSize: 14 } },
    },
    MuiSelect: {
      defaultProps: { size: "small" },
      styleOverrides: { select: { padding: "10px 12px" } },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          fontSize: 14,
          "&.Mui-selected": { backgroundColor: "rgba(0,118,222,0.08)" },
          "&.Mui-selected:hover": { backgroundColor: "rgba(0,118,222,0.12)" },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: "none" },
        outlined: { borderColor: BORDER },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true, size: "small" },
      styleOverrides: {
        root: { textTransform: "none", fontWeight: 500, borderRadius: 6 },
        outlined: { borderColor: BORDER, color: TEXT_PRIMARY },
      },
    },
    MuiSwitch: {
      defaultProps: { size: "small" },
    },
    MuiFormHelperText: {
      styleOverrides: { root: { fontSize: 12, marginLeft: 2 } },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: { fontSize: 12, backgroundColor: "#1A1A1A", borderRadius: 6 },
      },
    },
  },
});
