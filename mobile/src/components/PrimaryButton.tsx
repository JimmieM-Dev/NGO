import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '../theme';

type Props = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
};

export function PrimaryButton({ title, onPress, disabled, loading, variant = 'primary' }: Props) {
  const bg =
    variant === 'primary'
      ? colors.primary
      : variant === 'danger'
        ? colors.danger
        : colors.card;
  const fg = variant === 'secondary' ? colors.primary : '#ffffff';
  const borderColor = variant === 'secondary' ? colors.primary : bg;

  const isDisabled = Boolean(disabled || loading);

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, borderColor, opacity: isDisabled ? 0.6 : pressed ? 0.85 : 1 },
      ]}
    >
      <View style={styles.row}>
        {loading ? <ActivityIndicator color={fg} /> : null}
        <Text style={[styles.text, { color: fg }]}>{title}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  text: {
    fontSize: 15,
    fontWeight: '600',
  },
});
