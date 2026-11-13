int? parseEuroAmountToCents(String input) {
  final value = input.trim();
  if (value.isEmpty) return 0;

  final commaParts = value.split(',');
  if (commaParts.length > 2) return null;

  final wholePart = commaParts.first;
  final fractionPart = commaParts.length == 2 ? commaParts[1] : null;
  final wholeGroups = wholePart.split('.');
  final isGroupedWhole = wholeGroups.length > 1 &&
      RegExp(r'^\d{1,3}$').hasMatch(wholeGroups.first) &&
      wholeGroups.skip(1).every((group) => RegExp(r'^\d{3}$').hasMatch(group));
  final isPlainWhole = RegExp(r'^\d+$').hasMatch(wholePart);
  if (!isPlainWhole && !isGroupedWhole) return null;

  if (fractionPart != null &&
      (fractionPart.isEmpty ||
          fractionPart.length > 2 ||
          !RegExp(r'^\d+$').hasMatch(fractionPart))) {
    return null;
  }

  final wholeDigits = wholePart.replaceAll('.', '');
  final cents = (fractionPart ?? '').padRight(2, '0');
  return int.tryParse('$wholeDigits${cents.isEmpty ? '00' : cents}');
}
