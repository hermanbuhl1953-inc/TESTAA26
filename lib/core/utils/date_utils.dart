import 'package:intl/intl.dart';

class DateUtilsHelper {
  static final DateFormat _dateFormat = DateFormat('yyyy-MM-dd');

  static String formatDate(DateTime date) => _dateFormat.format(date);

  static DateTime parseDate(String value) => DateTime.parse(value);

  static DateTime dateOnly(DateTime date) => DateTime(date.year, date.month, date.day);

  static DateTime addMonthsClamped(DateTime date, int months) {
    final firstOfTargetMonth = DateTime(date.year, date.month + months, 1);
    final lastDayOfTargetMonth =
        DateTime(firstOfTargetMonth.year, firstOfTargetMonth.month + 1, 0).day;
    return DateTime(
      firstOfTargetMonth.year,
      firstOfTargetMonth.month,
      date.day > lastDayOfTargetMonth ? lastDayOfTargetMonth : date.day,
    );
  }

  static bool isInNextDays(DateTime date, int days) {
    final today = dateOnly(DateTime.now());
    final difference = dateOnly(date).difference(today).inDays;
    return difference >= 0 && difference <= days;
  }
}
