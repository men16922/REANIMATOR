;; REANIMATOR G1 observation harness v8-holdout-M04 (work copy only; not original data).
;; Overrides the engine's get_local_input Lisp hook (binary: symbol at 0xc8ff4, caller 0x5e2d3).
;; Engine constraints found in G1 (binary 0x3027d/0x3359c/0x25be7, lisp_init 0x30a9c):
;;  - user function bodies are paged from LCACHE into exact-size space #2: no string literals in defuns
;;  - top-level values must be created in perm-space or they go stale after tmp reset
;; Input script indexed by g_n = calls since the first call on the target level.
;; mover/cop_mover/try_move are the original machine code; only input source and logging change.
(load "abuse.lsp")
(perm-space)
(setq h_file "hlog.txt")
(setq h_mode "ab")
(setq h_n 0)
(setq h_end 130)
(tmp-space)
(defun h_xv (n)
  (if (< n 30) 0
    (if (< n 36) 1
      (if (< n 39) 0
        (if (< n 95) -1 0)))))
(defun h_yv (n)
  (if (or (eq n 52) (eq n 53)) -1 0))
(defun get_local_input ()
  (if (bg)
      (let ((xv (h_xv h_n)) (yv (h_yv h_n)))
        (open_file h_file h_mode
                   (print (list h_n (game_tick) xv yv (level_name)
                                (with_object (bg) (list (x) (y) (xvel) (yvel) (direction) (state) (xacel) (yacel) (fx) (fy) (fxvel) (fyvel) (fxacel) (fyacel) (gravity))))))
        (perm-space)
        (setq h_n (+ h_n 1))
        (tmp-space)
        (if (> h_n h_end) (quit))
        (list xv yv nil nil 0 0 0))
    (list 0 0 nil nil 0 0 0)))
