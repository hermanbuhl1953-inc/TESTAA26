import 'user.dart';

class Deadline {
  final String id;
  final String title;
  final String category;
  final String? description;
  final DateTime dueDate;
  final int recurrenceMonths;
  final int amountCents;
  final List<int> reminderDays;
  final bool isCompleted;
  final bool isArchived;
  final String? source;
  final String? catalogItemId;
  final ProfileType profileType;
  final String userId;
  final DateTime createdAt;
  final DateTime updatedAt;

  const Deadline({
    required this.id,
    required this.title,
    required this.category,
    this.description,
    required this.dueDate,
    required this.recurrenceMonths,
    required this.amountCents,
    required this.reminderDays,
    required this.isCompleted,
    required this.isArchived,
    this.source,
    this.catalogItemId,
    required this.profileType,
    required this.userId,
    required this.createdAt,
    required this.updatedAt,
  });

  Deadline copyWith({
    String? title,
    String? category,
    String? description,
    DateTime? dueDate,
    int? recurrenceMonths,
    int? amountCents,
    List<int>? reminderDays,
    bool? isCompleted,
    bool? isArchived,
    String? source,
    String? catalogItemId,
    ProfileType? profileType,
    String? userId,
    DateTime? updatedAt,
  }) {
    return Deadline(
      id: id,
      title: title ?? this.title,
      category: category ?? this.category,
      description: description ?? this.description,
      dueDate: dueDate ?? this.dueDate,
      recurrenceMonths: recurrenceMonths ?? this.recurrenceMonths,
      amountCents: amountCents ?? this.amountCents,
      reminderDays: reminderDays ?? this.reminderDays,
      isCompleted: isCompleted ?? this.isCompleted,
      isArchived: isArchived ?? this.isArchived,
      source: source ?? this.source,
      catalogItemId: catalogItemId ?? this.catalogItemId,
      profileType: profileType ?? this.profileType,
      userId: userId ?? this.userId,
      createdAt: createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }
}
