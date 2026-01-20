package org.example.repository;

import org.example.model.AccountLedger;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Repository for AccountLedger entries. Ledger entries are immutable - only
 * inserts, no updates.
 */
@Repository
public interface LedgerRepository extends JpaRepository<AccountLedger, Long> {

    /**
     * Get transaction history for an account.
     *
     * @param accountNumber Account to get history for
     * @return List of ledger entries ordered by creation time desc
     */
    List<AccountLedger> findByAccountNumberOrderByCreatedAtDesc(String accountNumber);

    // Note: ID is auto-generated using IDENTITY strategy, no need for manual sequence
    /**
     * Check if a transaction already exists (idempotency check).
     *
     * @param globalTxnId Transaction ID
     * @param accountNumber Account number
     * @param direction DEBIT or CREDIT
     * @return true if entry exists
     */
    boolean existsByGlobalTxnIdAndAccountNumberAndDirection(
            String globalTxnId,
            String accountNumber,
            AccountLedger.LedgerDirection direction);

    /**
     * Find ledger entry for reversal lookup.
     *
     * @param globalTxnId Transaction ID
     * @param direction Direction to find
     * @return List of matching entries
     */
    List<AccountLedger> findByGlobalTxnIdAndDirection(
            String globalTxnId,
            AccountLedger.LedgerDirection direction);

    /**
     * Get account statement for a date range.
     *
     * @param accountNumber Account number
     * @param from Start date
     * @param to End date
     * @return List of ledger entries
     */
    @Query("SELECT l FROM AccountLedger l WHERE l.accountNumber = :accountNumber "
            + "AND l.createdAt BETWEEN :from AND :to ORDER BY l.createdAt DESC")
    List<AccountLedger> findStatement(
            @Param("accountNumber") String accountNumber,
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to);

    /**
     * Get paginated transaction history for an account.
     *
     * @param accountNumber Account to get history for
     * @param pageable Pagination info
     * @return Page of ledger entries ordered by creation time desc
     */
    @Query("SELECT l FROM AccountLedger l WHERE l.accountNumber = :accountNumber ORDER BY l.createdAt DESC")
    org.springframework.data.domain.Page<AccountLedger> findByAccountNumberPaged(
            @Param("accountNumber") String accountNumber,
            org.springframework.data.domain.Pageable pageable);
}
