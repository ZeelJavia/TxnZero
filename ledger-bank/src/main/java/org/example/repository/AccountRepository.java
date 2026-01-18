package org.example.repository;

import jakarta.persistence.LockModeType;
import org.example.model.BankAccount;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;

/**
 * Repository for BankAccount with pessimistic locking support.
 * 
 * Uses PESSIMISTIC_WRITE lock to prevent concurrent modifications
 * during debit/credit operations. Combined with @Version for 
 * additional optimistic locking layer.
 */
@Repository
public interface AccountRepository extends JpaRepository<BankAccount, String> {

    /**
     * Find account by account number with PESSIMISTIC_WRITE lock.
     * This acquires a database-level row lock, preventing other
     * transactions from reading/modifying until commit/rollback.
     *
     * @param accountNumber The account number to find
     * @return Optional containing the locked account
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT a FROM BankAccount a WHERE a.accountNumber = :accountNumber")
    Optional<BankAccount> findByAccountNumberWithLock(@Param("accountNumber") String accountNumber);

    /**
     * Find account by VPA reference (used for VPA -> Account lookup).
     *
     * @param accountNumber The account number
     * @return Optional containing the account
     */
    Optional<BankAccount> findByAccountNumber(String accountNumber);

    /**
     * Check if account exists and is not frozen.
     *
     * @param accountNumber The account number
     * @return true if account exists and active
     */
    @Query("SELECT CASE WHEN COUNT(a) > 0 THEN true ELSE false END FROM BankAccount a " +
           "WHERE a.accountNumber = :accountNumber AND a.frozenStatus = false")
    boolean isAccountActive(@Param("accountNumber") String accountNumber);

<<<<<<< Updated upstream
    Optional<BankAccount> findByPhoneNumber(String phoneNumber);
=======

    Optional<BankAccount> findByPhoneNumber(String phonoNumber);
>>>>>>> Stashed changes
}
