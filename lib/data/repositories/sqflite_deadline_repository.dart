import 'package:sqflite/sqflite.dart';

import '../../domain/entities/deadline.dart';
import '../../domain/repositories/deadline_repository.dart';
import '../local/app_database.dart';
import '../models/deadline_model.dart';

class SqfliteDeadlineRepository implements DeadlineRepository {
  SqfliteDeadlineRepository({AppDatabase? database})
      : _database = database ?? AppDatabase.instance;

  final AppDatabase _database;

  Future<Database> get _db async => _database.database;

  @override
  Future<List<Deadline>> getAll() async {
    final rows = await (await _db).query(
      'deadlines',
      where: 'is_archived = 0',
      orderBy: 'due_date ASC, title COLLATE NOCASE ASC',
    );
    return rows.map(DeadlineModel.fromMap).map((model) => model.toEntity()).toList();
  }

  @override
  Future<Deadline?> getById(String id) async {
    final rows = await (await _db).query(
      'deadlines',
      where: 'id = ? AND is_archived = 0',
      whereArgs: [id],
      limit: 1,
    );
    if (rows.isEmpty) return null;
    return DeadlineModel.fromMap(rows.single).toEntity();
  }

  @override
  Future<void> save(Deadline deadline) async {
    await (await _db).insert(
      'deadlines',
      DeadlineModel.fromEntity(deadline).toMap(),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  @override
  Future<void> delete(String id) async {
    await (await _db).update(
      'deadlines',
      {'is_archived': 1, 'updated_at': DateTime.now().toIso8601String()},
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  @override
  Future<List<Deadline>> getByProfile(String profile) async {
    final rows = await (await _db).query(
      'deadlines',
      where: 'profile_type = ? AND is_archived = 0',
      whereArgs: [profile],
      orderBy: 'due_date ASC, title COLLATE NOCASE ASC',
    );
    return rows.map(DeadlineModel.fromMap).map((model) => model.toEntity()).toList();
  }
}
