import 'package:flutter_test/flutter_test.dart';

import 'package:scadenzario_mvp/core/utils/money_utils.dart';

void main() {
  group('parseEuroAmountToCents', () {
    test('converts decimal euro to integer cents', () {
      expect(parseEuroAmountToCents('125,50'), 12550);
      expect(parseEuroAmountToCents('12,5'), 1250);
    });

    test('supports Italian thousands separators', () {
      expect(parseEuroAmountToCents('1.234,56'), 123456);
    });

    test('accepts empty optional amount as zero', () {
      expect(parseEuroAmountToCents(''), 0);
    });

    test('rejects invalid grouping and more than two decimal places', () {
      expect(parseEuroAmountToCents('12.34,56'), isNull);
      expect(parseEuroAmountToCents('12,345'), isNull);
      expect(parseEuroAmountToCents('-1,00'), isNull);
    });
  });
}
