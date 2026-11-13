import 'dart:convert';

import '../../domain/entities/deadline.dart';
import '../../domain/entities/user.dart';

class DeadlineModel {
  final String id;
  final String title;
  final String category;
  final String? description;
  final String dueDate;
  final int recurrenceMonths;
  final int amountCents;
  final List<int> reminderDays;
  final bool isCompleted;
  final bool isArchived;
  final String? source;
  final String? catalogItemId;
  final String profileType;
  final String userId;
  final String createdAt;
  final String updatedAt;

  const DeadlineModel({
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

  factory DeadlineModel.fromEntity(Deadline deadline) {
    return DeadlineModel(
      id: deadline.id,
      title: deadline.title,
      category: deadline.category,
      description: deadline.description,
      dueDate: deadline.dueDate.toIso8601String().substring(0, 10),
      recurrenceMonths: deadline.recurrenceMonths,
      amountCents: deadline.amountCents,
      reminderDays: deadline.reminderDays,
      isCompleted: deadline.isCompleted,
      isArchived: deadline.isArchived,
      source: deadline.source,
      catalogItemId: deadline.catalogItemId,
      profileType: deadline.profileType.name,
      userId: deadline.userId,
      createdAt: deadline.createdAt.toIso8601String(),
      updatedAt: deadline.updatedAt.toIso8601String(),
    );
  }

  factory DeadlineModel.fromMap(Map<String, Object?> map) {
    return DeadlineModel(
      id: map['id'] as String,
      title: map['title'] as String,
      category: map['category'] as String,
      description: map['description'] as String?,
      dueDate: map['due_date'] as String,
      recurrenceMonths: map['recurrence_months'] as int,
      amountCents: map['amount_cents'] as int,
      reminderDays: (jsonDecode(map['reminder_days'] as String) as List<dynamic>)
          .map((value) => value as int)
          .toList(),
      isCompleted: (map['is_completed'] as int) == 1,
      isArchived: (map['is_archived'] as int) == 1,
      source: map['source'] as String?,
      catalogItemId: map['catalog_item_id'] as String?,
      profileType: map['profile_type'] as String,
      userId: map['user_id'] as String,
      createdAt: map['created_at'] as String,
      updatedAt: map['updated_at'] as String,
    );
  }

  Map<String, Object?> toMap() {
    return {
      'id': id,
      'title': title,
      'category': category,
      'description': description,
      'due_date': dueDate,
      'recurrence_months': recurrenceMonths,
      'amount_cents': amountCents,
      'reminder_days': jsonEncode(reminderDays),
      'is_completed': isCompleted ? 1 : 0,
      'is_archived': isArchived ? 1 : 0,
      'source': source,
      'catalog_item_id': catalogItemId,
      'profile_type': profileType,
      'user_id': userId,
      'created_at': createdAt,
      'updated_at': updatedAt,
    };
  }

  Deadline toEntity() {
    return Deadline(
      id: id,
      title: title,
      category: category,
      description: description,
      dueDate: DateTime.parse(dueDate),
      recurrenceMonths: recurrenceMonths,
      amountCents: amountCents,
      reminderDays: reminderDays,
      isCompleted: isCompleted,
      isArchived: isArchived,
      source: source,
      catalogItemId: catalogItemId,
      profileType:
          ProfileType.values.firstWhere((value) => value.name == profileType),
      userId: userId,
      createdAt: DateTime.parse(createdAt),
      updatedAt: DateTime.parse(updatedAt),
    );
  }
}
