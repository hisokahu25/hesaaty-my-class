<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Generate `students.student_code` only through the protected `prepare_student_code` trigger; a callable column default blocks authenticated inserts after helper execution is revoked.
- Run the student portal through token-validating database RPCs and the browser publishable client so external hosting never requires a service-role key.
