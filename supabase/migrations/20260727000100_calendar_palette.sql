-- 확정된 12색 라벨 팔레트로 기본값과 기존 8색 데이터를 옮긴다.
-- 사용자가 임의로 지정한 색은 건드리지 않는다.

alter table public.calendars
  alter column color set default '#1B54A8';

update public.calendars
set color = case color
  when '#4A90D9' then '#1B54A8'
  when '#2FB6A6' then '#12705F'
  when '#5FB85F' then '#62B84E'
  when '#E8A33D' then '#D8A72A'
  when '#E06C5A' then '#C3402C'
  when '#D45D9B' then '#A63363'
  when '#8B7BD8' then '#7A3FAE'
  when '#6B7683' then '#9AA1AC'
  else color
end
where color in (
  '#4A90D9',
  '#2FB6A6',
  '#5FB85F',
  '#E8A33D',
  '#E06C5A',
  '#D45D9B',
  '#8B7BD8',
  '#6B7683'
);

update public.events
set color = case color
  when '#4A90D9' then '#1B54A8'
  when '#2FB6A6' then '#12705F'
  when '#5FB85F' then '#62B84E'
  when '#E8A33D' then '#D8A72A'
  when '#E06C5A' then '#C3402C'
  when '#D45D9B' then '#A63363'
  when '#8B7BD8' then '#7A3FAE'
  when '#6B7683' then '#9AA1AC'
  else color
end
where color in (
  '#4A90D9',
  '#2FB6A6',
  '#5FB85F',
  '#E8A33D',
  '#E06C5A',
  '#D45D9B',
  '#8B7BD8',
  '#6B7683'
);
