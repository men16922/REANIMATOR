;; REANIMATOR G1 observation harness (work copy only; not original data).
;; Replaces the engine's get_local_input hook with a fixed per-call input script
;; and logs the focus object's state each call. mover/cop_mover stay original code.
;; State updates run in perm-space so values survive per-frame tmp-space reset.
(load "abuse.lsp")
(perm-space)
(setq h_n 0)
(setq h_log nil)
(setq h_end 420)
(defun h_xv (n)
  (if (< n 40) 0
    (if (< n 100) 1
      (if (< n 140) 0
        (if (< n 340) -1 0)))))
(defun h_yv (n)
  (if (or (eq n 360) (eq n 361)) -1 0))
(defun h_dump ()
  (open_file "hlog.txt" "wb" (print (reverse h_log))))
(defun get_local_input ()
  (let ((xv (h_xv h_n)) (yv (h_yv h_n)))
    (perm-space)
    (if (bg)
        (setq h_log (cons (list h_n (game_tick) xv yv
                                (with_object (bg) (list (x) (y) (xvel) (yvel) (direction))))
                          h_log)))
    (setq h_n (+ h_n 1))
    (if (eq h_n h_end) (h_dump))
    (tmp-space)
    (list xv yv nil nil 0 0 0)))
(tmp-space)
