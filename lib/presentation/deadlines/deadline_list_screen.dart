import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/utils/date_utils.dart';
import '../../data/repositories/sqflite_deadline_repository.dart';
import '../../domain/entities/deadline.dart';
import '../../domain/entities/user.dart';
import 'deadline_form_screen.dart';

class DeadlineListScreen extends StatefulWidget {
  const DeadlineListScreen({required this.user, super.key});

  final User user;

  @override
  State<DeadlineListScreen> createState() => _DeadlineListScreenState();
}

class _DeadlineListScreenState extends State<DeadlineListScreen> {
  final _repository = SqfliteDeadlineRepository();
  late Future<List<Deadline>> _deadlinesFuture;

  @override
  void initState() {
    super.initState();
    _deadlinesFuture = _loadDeadlines();
  }

  Future<List<Deadline>> _loadDeadlines() async {
    final deadlines = await _repository.getAll();
    return deadlines.where((deadline) => deadline.userId == widget.user.id).toList();
  }

  void _refresh() {
    setState(() => _deadlinesFuture = _loadDeadlines());
  }

  Future<void> _openForm([Deadline? deadline]) async {
    final result = await Navigator.of(context).push<Deadline>(
      MaterialPageRoute(
        builder: (_) => DeadlineFormScreen(
          user: widget.user,
          initialDeadline: deadline,
        ),
      ),
    );
    if (result == null) return;
    try {
      await _repository.save(result);
      _refresh();
    } catch (error) {
      _showStorageError(error);
    }
  }

  Future<void> _toggleCompletion(Deadline deadline, bool isCompleted) async {
    final updatedAt = DateTime.now();
    try {
      if (isCompleted && deadline.recurrenceMonths > 0) {
        final nextDueDate = DateUtilsHelper.addMonthsClamped(
          deadline.dueDate,
          deadline.recurrenceMonths,
        );
        await _repository.save(
          deadline.copyWith(
            dueDate: nextDueDate,
            isCompleted: false,
            updatedAt: updatedAt,
          ),
        );
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Completata. Prossima scadenza: '
              '${MaterialLocalizations.of(context).formatMediumDate(nextDueDate)}',
            ),
          ),
        );
      } else {
        await _repository.save(
          deadline.copyWith(isCompleted: isCompleted, updatedAt: updatedAt),
        );
      }
      _refresh();
    } catch (error) {
      _showStorageError(error);
    }
  }

  Future<void> _archive(Deadline deadline) async {
    final shouldArchive = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Archivia scadenza?'),
        content: Text('“${deadline.title}” verrà rimossa dalla lista attiva.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Annulla'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Archivia'),
          ),
        ],
      ),
    );
    if (shouldArchive != true) return;
    try {
      await _repository.delete(deadline.id);
      _refresh();
    } catch (error) {
      _showStorageError(error);
    }
  }

  void _showStorageError(Object error) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Operazione non riuscita: $error')),
    );
  }

  @override
  Widget build(BuildContext context) {
    final greetingName = widget.user.name.trim();
    return Scaffold(
      appBar: AppBar(
        title: const Text('Scadenzario'),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 16),
            child: Center(
              child: Text(
                greetingName,
                style: Theme.of(context).textTheme.titleSmall,
              ),
            ),
          ),
        ],
      ),
      body: FutureBuilder<List<Deadline>>(
        future: _deadlinesFuture,
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return _LoadError(error: snapshot.error!, onRetry: _refresh);
          }
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }

          final deadlines = snapshot.data ?? const <Deadline>[];
          final activeDeadlines =
              deadlines.where((deadline) => !deadline.isCompleted).toList();
          final completedDeadlines =
              deadlines.where((deadline) => deadline.isCompleted).toList();

          if (deadlines.isEmpty) {
            return _EmptyState(onAdd: _openForm);
          }

          return RefreshIndicator(
            onRefresh: () async => _refresh(),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
              children: [
                _SummaryCard(
                  activeCount: activeDeadlines.length,
                  overdueCount: activeDeadlines
                      .where((deadline) => _isOverdue(deadline.dueDate))
                      .length,
                ),
                const SizedBox(height: 16),
                if (activeDeadlines.isNotEmpty) ...[
                  Text('Prossime scadenze',
                      style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 8),
                  ...activeDeadlines.map(
                    (deadline) => _DeadlineCard(
                      deadline: deadline,
                      onToggle: (value) =>
                          _toggleCompletion(deadline, value ?? false),
                      onEdit: () => _openForm(deadline),
                      onArchive: () => _archive(deadline),
                    ),
                  ),
                ],
                if (completedDeadlines.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  Text('Completate',
                      style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 8),
                  ...completedDeadlines.map(
                    (deadline) => _DeadlineCard(
                      deadline: deadline,
                      onToggle: (value) =>
                          _toggleCompletion(deadline, value ?? false),
                      onEdit: () => _openForm(deadline),
                      onArchive: () => _archive(deadline),
                    ),
                  ),
                ],
              ],
            ),
          );
        },
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _openForm,
        icon: const Icon(Icons.add),
        label: const Text('Nuova scadenza'),
      ),
    );
  }

  bool _isOverdue(DateTime date) =>
      DateUtilsHelper.dateOnly(date).isBefore(DateUtilsHelper.dateOnly(DateTime.now()));
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({
    required this.activeCount,
    required this.overdueCount,
  });

  final int activeCount;
  final int overdueCount;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Card(
      color: colors.primaryContainer,
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Row(
          children: [
            Icon(Icons.notifications_active_outlined, color: colors.primary),
            const SizedBox(width: 14),
            Expanded(
              child: Text(
                overdueCount == 0
                    ? '$activeCount scadenze da gestire'
                    : '$overdueCount scadute · $activeCount da gestire',
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DeadlineCard extends StatelessWidget {
  const _DeadlineCard({
    required this.deadline,
    required this.onToggle,
    required this.onEdit,
    required this.onArchive,
  });

  final Deadline deadline;
  final ValueChanged<bool?> onToggle;
  final VoidCallback onEdit;
  final VoidCallback onArchive;

  static final _currencyFormat =
      NumberFormat.currency(locale: 'it_IT', symbol: '€');
  static const _categoryLabels = <String, String>{
    'auto': 'Auto e trasporti',
    'casa': 'Casa',
    'fisco': 'Fisco',
    'documenti': 'Documenti',
    'salute': 'Salute',
    'famiglia': 'Famiglia',
    'banca': 'Banca e rate',
    'assicurazioni': 'Assicurazioni',
    'abbonamenti': 'Abbonamenti',
    'lavoro': 'Lavoro',
    'altro': 'Altro',
  };

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final today = DateUtilsHelper.dateOnly(DateTime.now());
    final dueDate = DateUtilsHelper.dateOnly(deadline.dueDate);
    final daysRemaining = dueDate.difference(today).inDays;
    final isOverdue = daysRemaining < 0 && !deadline.isCompleted;
    final isSoon = daysRemaining >= 0 && daysRemaining <= 7 && !deadline.isCompleted;
    final statusColor = isOverdue
        ? theme.colorScheme.error
        : isSoon
            ? Colors.deepOrange
            : theme.colorScheme.onSurfaceVariant;
    final dateText = isOverdue
        ? 'Scaduta il ${_date(dueDate)}'
        : isSoon && daysRemaining > 0
            ? 'Tra $daysRemaining ${daysRemaining == 1 ? 'giorno' : 'giorni'} · ${_date(dueDate)}'
            : daysRemaining == 0 && !deadline.isCompleted
                ? 'Scade oggi'
                : _date(dueDate);

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: Checkbox(
          value: deadline.isCompleted,
          onChanged: onToggle,
        ),
        title: Text(
          deadline.title,
          style: TextStyle(
            decoration: deadline.isCompleted ? TextDecoration.lineThrough : null,
          ),
        ),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 5),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                dateText,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: statusColor,
                  fontWeight: isOverdue || isSoon ? FontWeight.w600 : null,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                [
                  _categoryLabels[deadline.category] ?? deadline.category,
                  if (deadline.amountCents > 0)
                    _currencyFormat.format(deadline.amountCents / 100),
                  if (deadline.recurrenceMonths > 0)
                    _recurrenceLabel(deadline.recurrenceMonths),
                ].join(' · '),
              ),
            ],
          ),
        ),
        trailing: PopupMenuButton<String>(
          tooltip: 'Azioni',
          onSelected: (action) {
            if (action == 'edit') onEdit();
            if (action == 'archive') onArchive();
          },
          itemBuilder: (_) => const [
            PopupMenuItem(value: 'edit', child: Text('Modifica')),
            PopupMenuItem(value: 'archive', child: Text('Archivia')),
          ],
        ),
        isThreeLine: true,
        onTap: onEdit,
      ),
    );
  }

  String _date(DateTime date) => DateFormat('d MMM yyyy', 'it_IT').format(date);

  String _recurrenceLabel(int months) =>
      months == 12 ? 'Ogni anno' : 'Ogni $months mesi';
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.onAdd});

  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.event_available, size: 64,
                color: Theme.of(context).colorScheme.primary),
            const SizedBox(height: 16),
            Text('Nessuna scadenza ancora',
                style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            const Text(
              'Aggiungi manualmente la prima scadenza. '
              'Le importazioni future richiederanno sempre la tua conferma.',
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: onAdd,
              icon: const Icon(Icons.add),
              label: const Text('Aggiungi scadenza'),
            ),
          ],
        ),
      ),
    );
  }
}

class _LoadError extends StatelessWidget {
  const _LoadError({required this.error, required this.onRetry});

  final Object error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, size: 48),
            const SizedBox(height: 12),
            Text('Errore nel caricamento delle scadenze:\n$error',
                textAlign: TextAlign.center),
            const SizedBox(height: 12),
            OutlinedButton(onPressed: onRetry, child: const Text('Riprova')),
          ],
        ),
      ),
    );
  }
}
